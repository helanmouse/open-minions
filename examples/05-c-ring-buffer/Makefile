CC = gcc
CFLAGS = -Wall -Wextra -std=c11
test: ring_buffer.c test_ring_buffer.c
	$(CC) $(CFLAGS) -o test_ring_buffer ring_buffer.c test_ring_buffer.c
	./test_ring_buffer
clean:
	rm -f test_ring_buffer
