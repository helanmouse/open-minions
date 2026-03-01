#ifndef RING_BUFFER_H
#define RING_BUFFER_H

#include <stdbool.h>

typedef struct {
    int *data;
    int capacity;
    int head;
    int tail;
    int count;
} RingBuffer;

RingBuffer *ring_buffer_create(int capacity);
void ring_buffer_destroy(RingBuffer *rb);
bool ring_buffer_push(RingBuffer *rb, int value);
bool ring_buffer_pop(RingBuffer *rb, int *value);
bool ring_buffer_is_empty(const RingBuffer *rb);
bool ring_buffer_is_full(const RingBuffer *rb);

#endif
