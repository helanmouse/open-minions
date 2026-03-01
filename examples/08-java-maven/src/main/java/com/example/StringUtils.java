package com.example;

public class StringUtils {
    public static String reverse(String s) {
        return new StringBuilder(s).reverse().toString();
    }

    public static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    // TODO: isPalindrome(String) — agent must add this
}
