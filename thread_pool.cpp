// thread_pool.cpp
// Minimal placeholder for a thread pool.

#include <thread>
#include <vector>

class ThreadPool {
public:
    explicit ThreadPool(unsigned int n = std::thread::hardware_concurrency()) : size(n) {}
    unsigned int size;
};

