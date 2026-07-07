#!/usr/bin/env python3
"""
CPU Benchmark - 综合运算性能测试
使用多线程执行混合运算（整数、浮点、位运算、三角函数、递归），
按完成时间计算性能分数（百万次操作/秒）。
由于 CPython 的 GIL，多线程无法利用多核并行计算，
本测试主要反映单核性能；如需多核测试请用 multiprocessing。
"""

import os
import time
import math
import threading

# 每个线程的混合运算序列长度（即一次循环执行这些运算，计8个操作）
SEQUENCE_LENGTH = 8

# 每个线程的操作总数（可根据需要调整，使得总运行时间约 5 秒）
# 对于 i5-13500H (12C/16T)，单核性能假设约 2000万次/秒，
# 8线程 × 5秒 ≈ 8亿次操作，因此每个线程 1亿次。
OPS_PER_THREAD = 100_000_000   # 1亿

def fib(n: int) -> int:
    """递归斐波那契（n=10 深度浅，速度快）"""
    if n <= 1:
        return n
    return fib(n-1) + fib(n-2)

def worker(operations: int, results: list, index: int):
    """
    执行混合运算的线程函数。
    operations: 总操作次数（会被调整到 SEQUENCE_LENGTH 的整数倍）
    results: 用于存储该线程的累加和（防止编译器优化）
    index: 结果列表中的索引
    """
    loops = operations // SEQUENCE_LENGTH
    # 局部变量，避免全局查找
    sin = math.sin
    cos = math.cos
    _fib = fib

    s = 0   # 累加器，防止运算被优化掉
    for _ in range(loops):
        # 1. 整数加法
        s += 1
        # 2. 整数乘法
        s *= 2
        # 3. 整数除法（保留浮点数）
        s = s / 3.0
        # 4. 位异或（需转换回整数）
        s = int(s) ^ 0x55555555
        # 5. 左移位
        s = (s << 2) & 0xFFFFFFFF
        # 6. 正弦
        s += sin(s % 360) * 1000
        # 7. 余弦
        s += cos(s % 360) * 1000
        # 8. 递归斐波那契（参数10，避免过深）
        s += _fib(10)

    results[index] = s

def main():
    # 获取 CPU 逻辑线程数
    num_threads = os.cpu_count()
    if num_threads is None:
        num_threads = 1

    # 计算总操作次数（所有线程累加）
    total_ops = OPS_PER_THREAD * num_threads
    # 平均分配，余数忽略（每个线程实际执行的操作数可能略少，但不影响分数）
    ops_per_thread = total_ops // num_threads

    threads = []
    results = [0] * num_threads

    print(f"CPU Benchmark - 综合运算测试")
    print(f"线程数: {num_threads}")
    print(f"每个线程操作数: {ops_per_thread:,}")
    print(f"总操作数: {ops_per_thread * num_threads:,}")
    print("开始测试...")

    start_time = time.perf_counter()

    # 创建并启动线程
    for i in range(num_threads):
        t = threading.Thread(target=worker, args=(ops_per_thread, results, i))
        threads.append(t)
        t.start()

    # 等待所有线程完成
    for t in threads:
        t.join()

    elapsed = time.perf_counter() - start_time

    # 校验总操作数（实际执行次数）
    actual_ops = (ops_per_thread // SEQUENCE_LENGTH) * SEQUENCE_LENGTH * num_threads
    # 计算分数：百万次操作/秒
    score = actual_ops / elapsed / 1_000_000

    print("-" * 50)
    print(f"实际操作数: {actual_ops:,}")
    print(f"耗时: {elapsed:.3f} 秒")
    print(f"性能分数: {score:.2f} 百万次/秒")
    print("-" * 50)

    # 可选：打印校验和（避免优化）
    # print(f"校验和: {sum(results)}")

if __name__ == "__main__":
    main()