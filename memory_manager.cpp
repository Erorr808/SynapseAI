// memory_manager.cpp
// Very small placeholder for custom memory management.

#include <cstddef>

void* synapse_allocate(std::size_t bytes) {
    return ::operator new(bytes);
}

void synapse_free(void* ptr) {
    ::operator delete(ptr);
}

