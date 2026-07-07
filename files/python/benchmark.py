#!/usr/bin/env python3
"""
CPU Benchmark - 单核/多核性能测试
选择模式：
    single : 单线程执行固定数量操作单元
    multi  : 多进程并行，动态分配任务，达到总操作数后停止
"""

import os
import sys
import time
import math
import threading
import multiprocessing as mp
from multiprocessing import Process, Queue, Event

# 每个操作单元包含的混合运算，返回累加值（防止优化）
def operation_unit(x: int) -> int:
    """执行一组混合运算，返回一个结果值（用于防止优化，同时增加计算量）"""
    s = x
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

# 子进程工作函数
def worker_process(queue: Queue, stop_event: Event, batch_size: int = 100):
    """
    持续执行操作单元，每完成 batch_size 次将累加值通过队列发送给主进程。
    当 stop_event 被设置时立即退出。
    """
    count = 0
    local_sum = 0  # 防止优化，但主要用于计数
    while not stop_event.is_set():
        local_sum += operation_unit(local_sum)
        count += 1
        if count % batch_size == 0:
            # 将批次完成数量发送给主进程
            queue.put(batch_size)
            count = 0
    # 发送剩余未满批次的单元数
    if count > 0:
        queue.put(count)

def monitor_and_stop(queue: Queue, stop_event: Event, target_units: int):
    """主进程中的监控线程：从队列读取完成的单元数，达到目标后设置停止事件。"""
    total = 0
    while total < target_units:
        try:
            # 超时等待，以免阻塞无法检查 stop_event（但这里不需要）
            units = queue.get(timeout=1.0)
            total += units
        except:
            # 队列为空或超时，继续循环
            pass
    # 达到目标，通知所有子进程停止
    stop_event.set()

def single_core_benchmark(total_units: int):
    """单核模式：单线程执行固定操作数，计时并输出分数。"""
    print(f"单核模式：总操作单元数 = {total_units:,}")
    start = time.perf_counter()
    x = 0
    for _ in range(total_units):
        x = operation_unit(x)
    elapsed = time.perf_counter() - start
    score = total_units / elapsed  # 单元/秒
    print("-" * 50)
    print(f"完成 {total_units:,} 个操作单元")
    print(f"耗时 {elapsed:.3f} 秒")
    print(f"性能分数：{score:,.2f} 操作单元/秒")
    print("-" * 50)

def multi_core_benchmark(target_units: int):
    """多核模式：使用多进程并行，当总完成单元数达到 target_units 时停止。"""
    num_cpus = os.cpu_count()
    print(f"多核模式：目标总操作单元 = {target_units:,}")
    print(f"使用 {num_cpus} 个 CPU 核心并行计算...")

    # 创建跨进程通信的对象
    queue = Queue()
    stop_event = Event()

    # 启动监控线程
    monitor_thread = threading.Thread(target=monitor_and_stop, args=(queue, stop_event, target_units))
    monitor_thread.start()

    # 启动子进程
    processes = []
    start_time = time.perf_counter()
    for _ in range(num_cpus):
        p = Process(target=worker_process, args=(queue, stop_event, 100))
        p.start()
        processes.append(p)

    # 等待监控线程完成（达到目标后 stop_event 被设置）
    monitor_thread.join()

    # 等待所有子进程退出
    for p in processes:
        p.join()

    elapsed = time.perf_counter() - start_time

    # 子进程可能已完成超过目标的少量额外单元，但实际用时以 stop_event 触发时间为准。
    # 这里我们仍以 target_units 作为有效操作数，因为超额部分极少，且 stop_event 触发后子进程几乎立即终止。
    score = target_units / elapsed
    print("-" * 50)
    print(f"完成 {target_units:,} 个操作单元")
    print(f"耗时 {elapsed:.3f} 秒")
    print(f"性能分数：{score:,.2f} 操作单元/秒")
    print("-" * 50)

def main():
    # 预定义操作单元总数，使得在 i5-13500H 上单核约 4-5 秒，多核更快
    single_total = 30_000_000   # 单核3000万单元
    multi_target = 50_000_000   # 多核总目标5000万单元

    print("=" * 50)
    print("CPU Benchmark")
    print("请选择测试模式：")
    mode = input("输入 single 或 multi 后回车：").strip().lower()

    if mode == "single":
        single_core_benchmark(single_total)
    elif mode == "multi":
        multi_core_benchmark(multi_target)
    else:
        print("无效输入，请输入 single 或 multi")
        sys.exit(1)

if __name__ == "__main__":
    # 在 Windows 上必须使用 freeze_support
    mp.freeze_support()
    main()