#include "linked_list.h"
#include <iostream>

LinkedList::LinkedList() : head(nullptr), count(0) {}

LinkedList::~LinkedList() {
    Node* current = head;
    while (current) {
        Node* next = current->next;
        delete current;
        current = next;
    }
}

void LinkedList::insert(int value) {
    Node* node = new Node(value);
    node->next = head;
    head = node;
    ++count;
}

bool LinkedList::remove(int value) {
    Node* current = head;
    Node* prev = nullptr;
    while (current) {
        if (current->data == value) {
            if (prev) {
                prev->next = current->next;
            } else {
                head = current->next;
            }
            delete current;
            --count;
            return true;
        }
        prev = current;
        current = current->next;
    }
    return false;
}

void LinkedList::print() const {
    Node* current = head;
    while (current) {
        std::cout << current->data;
        if (current->next) std::cout << " ";
        current = current->next;
    }
    std::cout << std::endl;
}

std::size_t LinkedList::size() const {
    return count;
}

int LinkedList::at(std::size_t index) const {
    if (index >= count) {
        throw std::out_of_range("index out of range");
    }
    Node* current = head;
    for (std::size_t i = 0; i < index; ++i) {
        current = current->next;
    }
    return current->data;
}

// TODO: Implement sort() — sort nodes in ascending order
void LinkedList::sort() {
    // Not yet implemented
}
