package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

func TestConcurrentAccess(t *testing.T) {
	srv := httptest.NewServer(NewMux())
	defer srv.Close()

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(2)
		go func(n int) {
			defer wg.Done()
			key := fmt.Sprintf("key%d", n)
			http.Get(fmt.Sprintf("%s/set?key=%s&value=val%d", srv.URL, key, n))
		}(i)
		go func(n int) {
			defer wg.Done()
			key := fmt.Sprintf("key%d", n)
			http.Get(fmt.Sprintf("%s/get?key=%s", srv.URL, key))
		}(i)
	}
	wg.Wait()
}
