package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// store is a shared map with NO synchronization — this is the bug.
var store = map[string]string{}

func NewMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/get", handleGet)
	mux.HandleFunc("/set", handleSet)
	return mux
}

func handleGet(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if key == "" {
		http.Error(w, "missing key", http.StatusBadRequest)
		return
	}

	val, ok := store[key]
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"key": key, "value": val})
}

func handleSet(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	value := r.URL.Query().Get("value")
	if key == "" || value == "" {
		http.Error(w, "missing key or value", http.StatusBadRequest)
		return
	}

	store[key] = value

	w.WriteHeader(http.StatusCreated)
	fmt.Fprintf(w, "stored %s=%s\n", key, value)
}

func main() {
	fmt.Println("listening on :8080")
	http.ListenAndServe(":8080", NewMux())
}
