// interop_wrapper.cpp
// Thin wrapper to allow higher-level languages to call engine functions.

extern "C" {
    int add_ints(int a, int b);

    int synapse_add(int a, int b) {
        return add_ints(a, b);
    }
}

