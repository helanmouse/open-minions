CXX = g++
CXXFLAGS = -Wall -Wextra -std=c++17

test: linked_list.cpp test_linked_list.cpp
	$(CXX) $(CXXFLAGS) -o test_linked_list linked_list.cpp test_linked_list.cpp
	./test_linked_list

clean:
	rm -f test_linked_list
