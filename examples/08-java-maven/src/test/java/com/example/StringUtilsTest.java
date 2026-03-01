package com.example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class StringUtilsTest {
    @Test void testReverse() {
        assertEquals("cba", StringUtils.reverse("abc"));
    }

    @Test void testCapitalize() {
        assertEquals("Hello", StringUtils.capitalize("hello"));
    }

    @Test void testIsPalindrome() {
        assertTrue(StringUtils.isPalindrome("racecar"));
        assertTrue(StringUtils.isPalindrome("Race Car"));
        assertFalse(StringUtils.isPalindrome("hello"));
    }

    @Test void testIsPalindromeEmpty() {
        assertTrue(StringUtils.isPalindrome(""));
        assertTrue(StringUtils.isPalindrome("a"));
    }
}
