#!/usr/bin/env python3
"""
CPU Benchmark - 单核/多核性能测试 (带进度汇报)
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

# ---------- 单核模式 ----------
def single_core_benchmark(total_units: int):
    print(f"\n单核模式：总操作单元数 = {total_units:,}")
    progress = [0]          # 使用列表作为可变共享变量
    stop_progress = threading.Event()

    def reporter():
        while not stop_progress.is_set():
            done = progress[0]
            print(f"[进度] 已完成 {done:,} / {total_units:,} ({done/total_units*100:.1f}%)")
            time.sleep(2.0)

    rep_thread = threading.Thread(target=reporter, daemon=True)
    rep_thread.start()

    start = time.perf_counter()
    x = 0
    for i in range(1, total_units + 1):
        x = operation_unit(x)
        if i % 1000 == 0:
            progress[0] = i
    progress[0] = total_units
    elapsed = time.perf_counter() - start

    stop_progress.set()
    rep_thread.join(timeout=0.2)

    score = total_units / elapsed
    print("-" * 50)
    print(f"完成 {total_units:,} 个操作单元")
    print(f"耗时 {elapsed:.3f} 秒")
    print(f"性能分数：{score:,.2f} 操作单元/秒")
    print("-" * 50)

# ---------- 多核模式 ----------
def worker_process(queue: Queue, stop_event: Event, batch_size: int = 100):
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

def monitor(queue: Queue, stop_event: Event, global_progress: Value, target_units: int):
    total = 0
    while total < target_units:
        try:
            units = queue.get(timeout=1.0)
            total += units
            global_progress.value = total
        except:
            pass
    stop_event.set()
    global_progress.value = total

def progress_reporter(global_progress: Value, stop_event: Event, target_units: int):
    while not stop_event.is_set():
        done = global_progress.value
        print(f"[进度] 已完成 {done:,} / {target_units:,} ({done/target_units*100:.1f}%)")
        time.sleep(2.0)
    done = global_progress.value
    print(f"[进度] 最终完成 {done:,} 个操作单元")

def multi_core_benchmark(target_units: int):
    num_cpus = os.cpu_count() or 4
    print(f"\n多核模式：目标总操作单元 = {target_units:,}")
    print(f"使用 {num_cpus} 个 CPU 核心并行计算...")

    queue = Queue()
    stop_event = Event()
    global_progress = Value('i', 0)

    mon_thread = threading.Thread(target=monitor, args=(queue, stop_event, global_progress, target_units), daemon=True)
    mon_thread.start()

    rep_thread = threading.Thread(target=progress_reporter, args=(global_progress, stop_event, target_units), daemon=True)
    rep_thread.start()

    processes = []
    start_time = time.perf_counter()
    for _ in range(num_cpus):
        p = Process(target=worker_process, args=(queue, stop_event, 100))
        p.daemon = True
        p.start()
        processes.append(p)

    mon_thread.join()
    for p in processes:
        p.join(timeout=1.0)

    elapsed = time.perf_counter() - start_time
    stop_event.set()   # 确保所有线程退出
    rep_thread.join(timeout=0.5)

    actual = global_progress.value
    score = actual / elapsed
    print("-" * 50)
    print(f"目标操作单元: {target_units:,}")
    print(f"实际完成: {actual:,}")
    print(f"耗时: {elapsed:.3f} 秒")
    print(f"性能分数: {score:,.2f} 操作单元/秒")
    print("-" * 50)

# ---------- 主入口 ----------
def main():
    print("=" * 50)
    print("CPU Benchmark (带实时进度)")
    print("请选择测试模式：")
    mode = input("输入 single 或 multi 后回车：").strip().lower()

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
    mp.freeze_support()
    main()