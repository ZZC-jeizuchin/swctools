#!/usr/bin/env python3
"""
CPU Benchmark - 自适应单核/多核性能测试（带进度汇报）
特点：
  - 动态校准，自动让测试持续约 5 秒
  - Windows 上提升进程优先级为 HIGH
  - Linux 上尝试设置 nice -20（需 sudo 或权限）
  - 每 2 秒汇报进度
"""

import os, sys, time, math, threading, platform
import multiprocessing as mp
from multiprocessing import Process, Queue, Event, Value

# ---------- 高性能优先级设置 ----------
def set_high_priority():
    """尽可能提高当前进程的调度优先级"""
    try:
        if platform.system() == 'Windows':
            import ctypes
            # HIGH_PRIORITY_CLASS = 0x80
            ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), 0x80)
            print("[INFO] Windows 进程优先级已设为 HIGH")
        else:
            # Linux / macOS：尝试 renice 到 -20
            try:
                os.nice(-20)
                print("[INFO] nice 值已设为 -20")
            except PermissionError:
                print("[WARN] 无权限设置高优先级，请用 sudo 运行以获得更准确的结果")
    except Exception as e:
        print(f"[WARN] 无法设置高优先级: {e}")

# ---------- 操作单元 ----------
def operation_unit(seed: int) -> int:
    """混合运算单元，返回一个整数"""
    s = seed
    s += 1
    s *= 3
    s //= 2
    s ^= 0xA5A5A5A5
    s = (s << 3) & 0xFFFFFFFF
    s = (s >> 1) | 0x80000000
    f = float(s)
    f = math.sin(f % 360) * 1000.0
    f = math.cos(f) * 1000.0
    f = math.log(abs(f) + 1.1) * 50.0
    s = int(f) + s
    def fib(n):
        if n <= 1: return n
        return fib(n-1) + fib(n-2)
    s += fib(10)
    return s

# ---------- 自适应校准 ----------
def calibrate_single(target_seconds=5.0) -> int:
    """
    单线程跑 1 秒，估算在 target_seconds 秒内能完成多少操作单元。
    返回推荐的总操作数。
    """
    print("[CALIBRATE] 正在校准单核速度...")
    duration = 1.0
    count = 0
    seed = 0
    start = time.perf_counter()
    while time.perf_counter() - start < duration:
        seed = operation_unit(seed)
        count += 1
    elapsed = time.perf_counter() - start
    ops_per_sec = count / elapsed
    total = int(ops_per_sec * target_seconds)
    print(f"[CALIBRATE] 单核速度: {ops_per_sec:,.0f} 单元/秒，目标 {target_seconds} 秒 → 总操作数 {total:,}")
    return total

def calibrate_multi(target_seconds=5.0, num_workers=None) -> int:
    """
    多进程校准：先启动所有 worker 跑 1 秒，统计总吞吐量，
    然后推算达到 target_seconds 需要的总操作数。
    注意：多进程模式下总操作数是所有进程完成的总和，我们需要设置一个
    全局目标，当所有进程完成的累计数达到该目标时停止。
    """
    if num_workers is None:
        num_workers = os.cpu_count() or 4
    print(f"[CALIBRATE] 正在用 {num_workers} 个进程校准多核速度...")

    queue = Queue()
    stop_event = Event()
    # 启动 worker 1 秒后停止
    def worker(stop, q):
        cnt = 0
        seed = 0
        while not stop.is_set():
            seed = operation_unit(seed)
            cnt += 1
        q.put(cnt)
    processes = []
    for _ in range(num_workers):
        p = Process(target=worker, args=(stop_event, queue))
        p.start()
        processes.append(p)

    time.sleep(1.0)
    stop_event.set()

    total_ops = 0
    for p in processes:
        p.join()
        total_ops += queue.get()

    ops_per_sec = total_ops / 1.0   # 因为跑了 1 秒
    target_total = int(ops_per_sec * target_seconds)
    print(f"[CALIBRATE] 多核总速度: {ops_per_sec:,.0f} 单元/秒，目标 {target_seconds} 秒 → 总操作数 {target_total:,}")
    return target_total

# ---------- 单核测试 ----------
def single_core_benchmark(total_units: int):
    progress = [0]
    stop_progress = threading.Event()

    def reporter():
        while not stop_progress.is_set():
            done = progress[0]
            print(f"[进度] 已完成 {done:,} / {total_units:,} ({done/total_units*100:.1f}%)")
            time.sleep(2.0)

    rep_thread = threading.Thread(target=reporter, daemon=True)
    rep_thread.start()

    start = time.perf_counter()
    seed = 0
    for i in range(1, total_units + 1):
        seed = operation_unit(seed)
        if i % 1000 == 0:
            progress[0] = i
    progress[0] = total_units
    elapsed = time.perf_counter() - start

    stop_progress.set()
    rep_thread.join(timeout=0.2)

    score = total_units / elapsed
    print("-" * 50)
    print(f"单核测试完成")
    print(f"操作单元: {total_units:,}")
    print(f"耗时: {elapsed:.3f} 秒")
    print(f"性能分数: {score:,.2f} 单元/秒")
    print("-" * 50)

# ---------- 多核测试 ----------
def worker_process(queue: Queue, stop_event: Event, batch_size: int = 100):
    cnt = 0
    seed = 0
    while not stop_event.is_set():
        seed = operation_unit(seed)
        cnt += 1
        if cnt % batch_size == 0:
            queue.put(batch_size)
            cnt = 0
    if cnt > 0:
        queue.put(cnt)

def monitor(queue: Queue, stop_event: Event, global_progress: Value, target: int):
    total = 0
    while total < target:
        try:
            units = queue.get(timeout=1.0)
            total += units
            global_progress.value = total
        except:
            pass
    stop_event.set()
    global_progress.value = total

def progress_reporter(global_progress: Value, stop_event: Event, target: int):
    while not stop_event.is_set():
        done = global_progress.value
        print(f"[进度] 已完成 {done:,} / {target:,} ({done/target*100:.1f}%)")
        time.sleep(2.0)
    done = global_progress.value
    print(f"[进度] 最终完成 {done:,} 个操作单元")

def multi_core_benchmark(target_units: int):
    num_cpus = os.cpu_count() or 4
    print(f"\n多核模式：目标总操作单元 = {target_units:,}，使用 {num_cpus} 个核心")

    queue = Queue()
    stop_event = Event()
    global_progress = Value('i', 0)

    mon_thread = threading.Thread(target=monitor, args=(queue, stop_event, global_progress, target_units), daemon=True)
    mon_thread.start()

    rep_thread = threading.Thread(target=progress_reporter, args=(global_progress, stop_event, target_units), daemon=True)
    rep_thread.start()

    processes = []
    start = time.perf_counter()
    for _ in range(num_cpus):
        p = Process(target=worker_process, args=(queue, stop_event, 100))
        p.start()
        processes.append(p)

    mon_thread.join()
    for p in processes:
        p.join(timeout=1.0)

    elapsed = time.perf_counter() - start
    stop_event.set()
    rep_thread.join(timeout=0.5)

    actual = global_progress.value
    score = actual / elapsed
    print("-" * 50)
    print(f"多核测试完成")
    print(f"目标操作单元: {target_units:,}，实际完成: {actual:,}")
    print(f"耗时: {elapsed:.3f} 秒")
    print(f"性能分数: {score:,.2f} 单元/秒")
    print("-" * 50)

# ---------- 主入口 ----------
def main():
    set_high_priority()

    print("=" * 50)
    print("CPU Benchmark (自适应 + 高优先级)")
    print("请选择测试模式：")
    mode = input("输入 single 或 multi 后回车：").strip().lower()

    if mode == "single":
        total = calibrate_single(target_seconds=5.0)
        single_core_benchmark(total)
    elif mode == "multi":
        total = calibrate_multi(target_seconds=5.0)
        multi_core_benchmark(total)
    else:
        print("无效输入，请输入 single 或 multi")
        sys.exit(1)

if __name__ == "__main__":
    mp.freeze_support()
    main()
