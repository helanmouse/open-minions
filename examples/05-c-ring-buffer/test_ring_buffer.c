#include "ring_buffer.h"
#include <assert.h>
#include <stdio.h>

void test_create_destroy() {
    RingBuffer *rb = ring_buffer_create(5);
    assert(rb != NULL);
    assert(ring_buffer_is_empty(rb));
    assert(!ring_buffer_is_full(rb));
    ring_buffer_destroy(rb);
    printf("  PASS: create_destroy\n");
}

void test_push_single() {
    RingBuffer *rb = ring_buffer_create(5);
    assert(ring_buffer_push(rb, 42));
    assert(!ring_buffer_is_empty(rb));
    ring_buffer_destroy(rb);
    printf("  PASS: push_single\n");
}

void test_push_until_full() {
    RingBuffer *rb = ring_buffer_create(3);
    assert(ring_buffer_push(rb, 1));
    assert(ring_buffer_push(rb, 2));
    assert(ring_buffer_push(rb, 3));
    assert(ring_buffer_is_full(rb));
    assert(!ring_buffer_push(rb, 4));  // overflow
    ring_buffer_destroy(rb);
    printf("  PASS: push_until_full\n");
}

void test_pop_single() {
    RingBuffer *rb = ring_buffer_create(5);
    ring_buffer_push(rb, 99);
    int val = 0;
    assert(ring_buffer_pop(rb, &val));
    assert(val == 99);
    assert(ring_buffer_is_empty(rb));
    ring_buffer_destroy(rb);
    printf("  PASS: pop_single\n");
}

void test_pop_until_empty() {
    RingBuffer *rb = ring_buffer_create(3);
    ring_buffer_push(rb, 10);
    ring_buffer_push(rb, 20);
    int val;
    assert(ring_buffer_pop(rb, &val)); assert(val == 10);
    assert(ring_buffer_pop(rb, &val)); assert(val == 20);
    assert(ring_buffer_is_empty(rb));
    assert(!ring_buffer_pop(rb, &val));  // underflow
    ring_buffer_destroy(rb);
    printf("  PASS: pop_until_empty\n");
}

void test_push_pop_interleave() {
    RingBuffer *rb = ring_buffer_create(3);
    int val;
    ring_buffer_push(rb, 1);
    ring_buffer_push(rb, 2);
    ring_buffer_pop(rb, &val); assert(val == 1);
    ring_buffer_push(rb, 3);
    ring_buffer_push(rb, 4);
    assert(ring_buffer_is_full(rb));
    ring_buffer_pop(rb, &val); assert(val == 2);
    ring_buffer_pop(rb, &val); assert(val == 3);
    ring_buffer_pop(rb, &val); assert(val == 4);
    assert(ring_buffer_is_empty(rb));
    ring_buffer_destroy(rb);
    printf("  PASS: push_pop_interleave\n");
}

int main() {
    test_create_destroy();
    test_push_single();
    test_push_until_full();
    test_pop_single();
    test_pop_until_empty();
    test_push_pop_interleave();
    printf("PASS: 05-c-ring-buffer\n");
    return 0;
}
