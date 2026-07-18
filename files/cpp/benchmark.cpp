/*
 * CPU Benchmark - C++ version
 * Compile: g++ -std=c++17 -pthread -O2 benchmark.cpp -o benchmark
 *          (MSVC: cl /EHsc /std:c++17 /O2 benchmark.cpp)
 */

#include <iostream>
#include <thread>
#include <atomic>
#include <vector>
#include <chrono>
#include <cmath>
#include <string>
#include <iomanip>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#include <sys/resource.h>
#endif

// ========== 高优先级设置 ==========
void set_high_priority() {
#ifdef _WIN32
    if (!SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS)) {
        std::cerr << "[WARN] 无法设置高优先级，请以管理员运行\n";
    } else {
        std::cout << "[INFO] Windows 进程优先级已设为 HIGH\n";
    }
#else
    if (nice(-20) == -1) {
        std::cerr << "[WARN] 无权限设置高优先级，请用 sudo 运行\n";
    } else {
        std::cout << "[INFO] Linux nice 值已设为 -20\n";
    }
#endif
}

// ========== 递归斐波那契（避免 lambda 递归错误） ==========
int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

// ========== 操作单元（混合运算，防止优化） ==========
int operation_unit(int seed) {
    int s = seed;
    s += 1;
    s *= 3;
    s /= 2;
    s ^= 0xA5A5A5A5;
    s = (s << 3) & 0xFFFFFFFF;
    s = (s >> 1) | 0x80000000;
    double f = static_cast<double>(s);
    f = std::sin(std::fmod(f, 360.0)) * 1000.0;
    f = std::cos(f) * 1000.0;
    f = std::log(std::abs(f) + 1.1) * 50.0;
    s = static_cast<int>(f) + s;
    s += fib(10);
    return s;
}

// ========== 单核校准（跑 1 秒） ==========
uint64_t calibrate_single() {
    std::cout << "[CALIBRATE] 校准单核速度...\n";
    uint64_t count = 0;
    int seed = 0;
    auto start = std::chrono::steady_clock::now();
    while (std::chrono::steady_clock::now() - start < std::chrono::seconds(1)) {
        seed = operation_unit(seed);
        ++count;
    }
    std::cout << "  单核速度: " << count << " 单元/秒\n";
    return count;
}

// ========== 多核校准（所有核心跑 1 秒） ==========
uint64_t calibrate_multi(unsigned num_threads) {
    std::cout << "[CALIBRATE] 校准多核速度 (使用 " << num_threads << " 个线程)...\n";
    std::atomic<uint64_t> total_ops{0};
    std::atomic<bool> stop{false};

    auto worker = [&]() {
        int seed = 0;
        uint64_t local_count = 0;
        while (!stop.load(std::memory_order_relaxed)) {
            seed = operation_unit(seed);
            ++local_count;
        }
        total_ops.fetch_add(local_count, std::memory_order_relaxed);
    };

    std::vector<std::thread> threads;
    for (unsigned i = 0; i < num_threads; ++i)
        threads.emplace_back(worker);

    std::this_thread::sleep_for(std::chrono::seconds(1));
    stop.store(true, std::memory_order_relaxed);

    for (auto& t : threads) t.join();

    uint64_t ops = total_ops.load();
    std::cout << "  多核总速度: " << ops << " 单元/秒\n";
    return ops;
}

// ========== 进度汇报线程 ==========
void progress_reporter(std::atomic<bool>& stop, std::atomic<uint64_t>& ops,
                       double test_seconds, const std::string& mode) {
    auto start = std::chrono::steady_clock::now();
    while (!stop.load(std::memory_order_relaxed)) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        auto elapsed = std::chrono::duration<double>(
            std::chrono::steady_clock::now() - start).count();
        uint64_t done = ops.load(std::memory_order_relaxed);
        double percent = std::min(elapsed / test_seconds * 100.0, 100.0);
        std::cout << "[" << mode << " 进度] " << std::fixed << std::setprecision(1)
                  << percent << "%  (已运行 " << elapsed << " 秒, 完成 "
                  << done << " 单元)\n";
    }
}

// ========== 单核正式测试（跑 test_seconds 秒） ==========
void single_test(double test_seconds) {
    std::cout << "\n单核测试：运行 " << test_seconds << " 秒...\n";
    std::atomic<uint64_t> total_ops{0};
    std::atomic<bool> stop{false};

    // 启动进度汇报线程
    std::thread reporter(progress_reporter, std::ref(stop), std::ref(total_ops),
                         test_seconds, "SINGLE");

    int seed = 0;
    auto start = std::chrono::steady_clock::now();
    while (std::chrono::steady_clock::now() - start < std::chrono::seconds(static_cast<int>(test_seconds))) {
        seed = operation_unit(seed);
        total_ops.fetch_add(1, std::memory_order_relaxed);
    }
    double elapsed = std::chrono::duration<double>(
        std::chrono::steady_clock::now() - start).count();

    stop.store(true, std::memory_order_relaxed);
    reporter.join();

    uint64_t ops = total_ops.load();
    double score = ops / elapsed;
    std::cout << "--------------------------------------------------\n"
              << "单核测试完成: " << ops << " 单元, "
              << "耗时 " << elapsed << " 秒\n"
              << "性能分数: " << score << " 单元/秒\n"
              << "--------------------------------------------------\n";
}

// ========== 多核正式测试（num_threads 个线程跑 test_seconds 秒） ==========
void multi_test(unsigned num_threads, double test_seconds) {
    std::cout << "\n多核测试：" << num_threads << " 线程, 运行 "
              << test_seconds << " 秒...\n";
    std::atomic<uint64_t> total_ops{0};
    std::atomic<bool> stop{false};

    // 启动进度汇报线程
    std::thread reporter(progress_reporter, std::ref(stop), std::ref(total_ops),
                         test_seconds, "MULTI");

    auto worker = [&]() {
        int seed = 0;
        uint64_t local_count = 0;
        while (!stop.load(std::memory_order_relaxed)) {
            seed = operation_unit(seed);
            ++local_count;
        }
        total_ops.fetch_add(local_count, std::memory_order_relaxed);
    };

    std::vector<std::thread> threads;
    for (unsigned i = 0; i < num_threads; ++i)
        threads.emplace_back(worker);

    std::this_thread::sleep_for(std::chrono::seconds(static_cast<int>(test_seconds)));
    stop.store(true, std::memory_order_relaxed);

    // 实际耗时可能稍微超过 test_seconds，这里采用固定值计算分数
    double elapsed = test_seconds; 

    for (auto& t : threads) t.join();
    reporter.join();

    uint64_t ops = total_ops.load();
    double score = ops / elapsed;
    std::cout << "--------------------------------------------------\n"
              << "多核测试完成: " << ops << " 单元, "
              << "耗时约 " << elapsed << " 秒\n"
              << "性能分数: " << score << " 单元/秒\n"
              << "--------------------------------------------------\n";
}

// ========== 主函数 ==========
int main() {
    set_high_priority();

    std::cout << "==================================================\n"
              << "CPU Benchmark (C++)\n"
              << "请选择测试模式 (single / multi): ";

    std::string mode;
    std::cin >> mode;

    const double TEST_SECONDS = 5.0;

    if (mode == "single") {
        calibrate_single();
        single_test(TEST_SECONDS);
    } else if (mode == "multi") {
        unsigned num_threads = std::thread::hardware_concurrency();
        if (num_threads == 0) num_threads = 4;
        calibrate_multi(num_threads);
        multi_test(num_threads, TEST_SECONDS);
    } else {
        std::cerr << "无效输入，请输入 single 或 multi\n";
        return 1;
    }

    return 0;
}