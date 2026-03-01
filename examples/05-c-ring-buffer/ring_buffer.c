#include "ring_buffer.h"
#include <stdlib.h>

RingBuffer *ring_buffer_create(int capacity) {
    // TODO: allocate RingBuffer and data array
    return NULL;
}

void ring_buffer_destroy(RingBuffer *rb) {
    // TODO: free data and struct
}

bool ring_buffer_push(RingBuffer *rb, int value) {
    // TODO: add value, return false if full
    return false;
}

bool ring_buffer_pop(RingBuffer *rb, int *value) {
    // TODO: remove value, return false if empty
    return false;
}

bool ring_buffer_is_empty(const RingBuffer *rb) {
    // TODO
    return true;
}

bool ring_buffer_is_full(const RingBuffer *rb) {
    // TODO
    return false;
}
