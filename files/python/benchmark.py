#!/usr/bin/env python3
"""
CPU Benchmark - 单核/多核性能测试 (带进度汇报)
功能：
    single : 单线程执行固定操作单元，每2秒报告进度
    multi  : 多进程并行，动态分配，达到总操作数后停止，每2秒报告全局进度
"""

import os
import sys
import time
import math
import threading
import multiprocessing as mp
from multiprocessing import Process, Queue, Event, Value

# ---------- 操作单元定义 ----------
def operation_unit(seed: int) -> int:
    """执行一组混合运算，返回一个结果值（用于防止优化）"""
    s = seed
    # 整数运算
    s += 1
    s *= 3
    s //= 2
    # 位运算
    s ^= 0xA5A5A5A5
    s = (s << 3) & 0xFFFFFFFF
    s = (s >> 1) | 0x80000000
    # 浮点运算
    f = float(s)
    f = math.sin(f % 360) * 1000.0
    f = math.cos(f) * 1000.0
    f = math.log(abs(f) + 1.1) * 50.0
    s = int(f) + s
    # 递归（深度小）
    def fib(n):
        if n <= 1: return n
        return fib(n-1) + fib(n-2)
    s += fib(10)
    return s

# ---------- 单核模式（带汇报） ----------
def single_core_benchmark(total_units: int):
    """单线程执行，通过进度线程每2秒报告完成数量。"""
    print(f"\n单核模式：总操作单元数 = {total_units:,}")
    progress = Value('i', 0)   # 使用 multiprocessing.Value 便于共享（即使单线程也统一接口）
    stop_progress = Event()

    def progress_reporter():
        """低优先级汇报线程，每2秒打印进度"""
        while not stop_progress.is_set():
            done = progress.value
            print(f"[进度] 已完成 {done:,} / {total_units:,} ({done/total_units*100:.1f}%)")
            time.sleep(2.0)

    reporter = threading.Thread(target=progress_reporter, daemon=True)
    reporter.start()

    start = time.perf_counter()
    x = 0
    for i in range(1, total_units + 1):
        x = operation_unit(x)
        # 每完成1000个单元更新一次进度（减少锁竞争）
        if i % 1000 == 0:
            progress.value = i
    progress.value = total_units   # 最终更新
    elapsed = time.perf_counter() - start

    stop_progress.set()
    reporter.join(timeout=0.1)

    score = total_units / elapsed
    print("-" * 50)
    print(f"完成 {total_units:,} 个操作单元")
    print(f"耗时 {elapsed:.3f} 秒")
    print(f"性能分数：{score:,.2f} 操作单元/秒")
    print("-" * 50)

# ---------- 多核模式（动态分配 + 汇报） ----------
def worker_process(queue: Queue, stop_event: Event, batch_size: int = 100):
    """子进程：持续执行操作单元，每批次将完成数放入队列。"""
    count = 0
    seed = 0
    while not stop_event.is_set():
        seed = operation_unit(seed)
        count += 1
        if count % batch_size == 0:
            queue.put(batch_size)
            count = 0
    if count > 0:
        queue.put(count)

def monitor_and_aggregate(queue: Queue, stop_event: Event, global_progress: Value, target_units: int):
    """监控线程：从队列收集完成数并累加到 global_progress。当达到目标时设置停止事件。"""
    total = 0
    while total < target_units:
        try:
            units = queue.get(timeout=1.0)
            total += units
            # 更新全局进度（原子赋值）
            global_progress.value = total
        except:
            # 超时继续
            pass
    stop_event.set()
    global_progress.value = total   # 最终更新

def progress_reporter(global_progress: Value, stop_event: Event, target_units: int):
    """汇报线程：每2秒打印全局进度（低优先级）。"""
    while not stop_event.is_set():
        done = global_progress.value
        print(f"[进度] 已完成 {done:,} / {target_units:,} ({done/target_units*100:.1f}%)")
        time.sleep(2.0)
    # 退出前打印最终状态（可能略超过目标）
    done = global_progress.value
    print(f"[进度] 最终完成 {done:,} 个操作单元")

def multi_core_benchmark(target_units: int):
    """多核模式：使用多进程并行，当总完成数达到 target_units 时停止，期间每2秒报告进度。"""
    num_cpus = os.cpu_count() or 4
    print(f"\n多核模式：目标总操作单元 = {target_units:,}")
    print(f"使用 {num_cpus} 个 CPU 核心并行计算...")

    queue = Queue()
    stop_event = Event()
    global_progress = Value('i', 0)   # 跨进程共享的原子整型

    # 启动监控线程（累加队列中的完成数）
    monitor = threading.Thread(target=monitor_and_aggregate,
                               args=(queue, stop_event, global_progress, target_units))
    monitor.daemon = True
    monitor.start()

    # 启动汇报线程（每2秒输出进度）
    reporter = threading.Thread(target=progress_reporter,
                                args=(global_progress, stop_event, target_units))
    reporter.daemon = True
    reporter.start()

    # 启动子进程
    processes = []
    start_time = time.perf_counter()
    for _ in range(num_cpus):
        p = Process(target=worker_process, args=(queue, stop_event, 100))
        p.daemon = True
        p.start()
        processes.append(p)

    # 等待监控线程结束（即目标达成，stop_event 被设置）
    monitor.join()

    # 等待所有子进程退出
    for p in processes:
        p.join(timeout=1.0)

    elapsed = time.perf_counter() - start_time

    # 停止汇报线程
    stop_event.set()   # 如果监控线程已设置，则无妨
    reporter.join(timeout=0.5)

    # 实际完成数可能略微超过目标，但计分仍以目标值为准（更精确的计分可用 global_progress.value）
    actual_done = global_progress.value
    score = actual_done / elapsed
    print("-" * 50)
    print(f"目标操作单元: {target_units:,}")
    print(f"实际完成: {actual_done:,}")
    print(f"耗时: {elapsed:.3f} 秒")
    print(f"性能分数: {score:,.2f} 操作单元/秒")
    print("-" * 50)

# ---------- 主入口 ----------
def main():
    print("=" * 50)
    print("CPU Benchmark (带实时进度)")
    print("请选择测试模式：")
    mode = input("输入 single 或 multi 后回车：").strip().lower()

    # 预定义操作单元数 (i5-13500H 单核约4-5秒，多核更快)
    SINGLE_TOTAL = 30_000_000
    MULTI_TARGET = 50_000_000

    if mode == "single":
        single_core_benchmark(SINGLE_TOTAL)
    elif mode == "multi":
        multi_core_benchmark(MULTI_TARGET)
    else:
        print("无效输入，请输入 single 或 multi")
        sys.exit(1)

if __name__ == "__main__":
    # Windows 下多进程必须调用 freeze_support
    mp.freeze_support()
    main()