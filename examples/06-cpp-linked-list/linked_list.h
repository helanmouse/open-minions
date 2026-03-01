#ifndef LINKED_LIST_H
#define LINKED_LIST_H

#include <cstddef>
#include <stdexcept>

struct Node {
    int data;
    Node* next;
    Node(int val) : data(val), next(nullptr) {}
};

class LinkedList {
public:
    LinkedList();
    ~LinkedList();

    void insert(int value);
    bool remove(int value);
    void print() const;
    std::size_t size() const;
    int at(std::size_t index) const;

    // TODO: Add a sort() method that sorts nodes in ascending order
    void sort();

private:
    Node* head;
    std::size_t count;
};

#endif // LINKED_LIST_H
