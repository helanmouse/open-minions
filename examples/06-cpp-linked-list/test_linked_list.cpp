#include "linked_list.h"
#include <cassert>
#include <iostream>

void test_insert_and_size() {
    LinkedList list;
    assert(list.size() == 0);
    list.insert(10);
    list.insert(20);
    list.insert(30);
    assert(list.size() == 3);
    std::cout << "  insert_and_size OK" << std::endl;
}

void test_remove() {
    LinkedList list;
    list.insert(1);
    list.insert(2);
    list.insert(3);
    assert(list.remove(2) == true);
    assert(list.size() == 2);
    assert(list.remove(99) == false);
    assert(list.size() == 2);
    std::cout << "  remove OK" << std::endl;
}

void test_sort() {
    LinkedList list;
    list.insert(5);
    list.insert(3);
    list.insert(8);
    list.insert(1);
    list.insert(4);
    list.sort();
    assert(list.size() == 5);
    assert(list.at(0) == 1);
    assert(list.at(1) == 3);
    assert(list.at(2) == 4);
    assert(list.at(3) == 5);
    assert(list.at(4) == 8);
    std::cout << "  sort OK" << std::endl;
}

void test_sort_empty() {
    LinkedList list;
    list.sort();
    assert(list.size() == 0);
    std::cout << "  sort_empty OK" << std::endl;
}

void test_sort_single() {
    LinkedList list;
    list.insert(42);
    list.sort();
    assert(list.size() == 1);
    assert(list.at(0) == 42);
    std::cout << "  sort_single OK" << std::endl;
}

int main() {
    test_insert_and_size();
    test_remove();
    test_sort();
    test_sort_empty();
    test_sort_single();
    std::cout << "PASS: 06-cpp-linked-list" << std::endl;
    return 0;
}
