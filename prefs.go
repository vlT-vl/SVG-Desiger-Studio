package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"

	nexpkg "nex/nex"
)

const maxPreferenceValueLength = 512

type preferenceStore struct {
	mu          sync.Mutex
	path        string
	defaultDir  string
	defaultPath string
	pointerPath string
	pathErr     error
}

type preferenceLocation struct {
	Path      string `json:"path"`
	IsDefault bool   `json:"isDefault"`
}

type preferencePointer struct {
	Path string `json:"path"`
}

func newPreferenceStore() *preferenceStore {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return &preferenceStore{pathErr: err}
	}
	defaultDir := filepath.Join(configDir, "SVG Designer Studio")
	defaultPath := filepath.Join(defaultDir, "prefs.json")
	s := &preferenceStore{
		path:        defaultPath,
		defaultDir:  defaultDir,
		defaultPath: defaultPath,
		pointerPath: filepath.Join(defaultDir, "location.json"),
	}
	if envPath := strings.TrimSpace(os.Getenv("SVG_DESIGNER_PREFS_FILE")); envPath != "" {
		if path, ok := s.startupEnvPath(envPath); ok {
			s.path = path
		}
		return s
	}
	if path, ok := s.readPointer(); ok {
		s.path = path
	}
	return s
}

func validPreference(key, value string) bool {
	if len(value) > maxPreferenceValueLength {
		return false
	}
	switch key {
	case "nex-theme":
		return value == "system" || value == "light" || value == "dark"
	case "svg-designer-ui":
		return validUISettings(value)
	default:
		return false
	}
}

func validUISettings(value string) bool {
	var ui struct {
		ShowOptimize    *bool    `json:"showOptimize"`
		ShowPrettify    *bool    `json:"showPrettify"`
		ShowColorPicker *bool    `json:"showColorPicker"`
		VisibleTabs     []string `json:"visibleTabs"`
	}
	if json.Unmarshal([]byte(value), &ui) != nil {
		return false
	}
	if ui.ShowOptimize == nil || ui.ShowPrettify == nil || ui.ShowColorPicker == nil || len(ui.VisibleTabs) == 0 {
		return false
	}
	allowed := map[string]bool{"preview": true, "react": true, "reactnative": true, "png": true, "datauri": true}
	seen := map[string]bool{}
	for _, tab := range ui.VisibleTabs {
		if !allowed[tab] || seen[tab] {
			return false
		}
		seen[tab] = true
	}
	return true
}

func bindParams(c *nexpkg.Context, params json.RawMessage, v any) error {
	if err := c.Bind(params, v); err != nil {
		return nexpkg.Errorf("bad_request", "%v", err)
	}
	return nil
}

func decodePreferences(data []byte) (map[string]string, bool) {
	var stored map[string]string
	if err := json.Unmarshal(data, &stored); err != nil || stored == nil {
		return map[string]string{}, false
	}
	for key, value := range stored {
		if !validPreference(key, value) {
			return map[string]string{}, false
		}
	}
	return stored, true
}

func readPreferences(path string) (map[string]string, bool, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]string{}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	prefs, valid := decodePreferences(data)
	return prefs, valid, nil
}

func cleanAbsolutePath(path string) (string, bool) {
	if path == "" || !filepath.IsAbs(path) {
		return "", false
	}
	return filepath.Clean(path), true
}

func regularOrMissing(path string) bool {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return true
	}
	return err == nil && info.Mode().IsRegular()
}

func (s *preferenceStore) startupEnvPath(path string) (string, bool) {
	path, ok := cleanAbsolutePath(path)
	if !ok || path == s.pointerPath || !regularOrMissing(path) {
		return "", false
	}
	return path, true
}

func (s *preferenceStore) readPointer() (string, bool) {
	data, err := os.ReadFile(s.pointerPath)
	if err != nil {
		return "", false
	}
	var pointer preferencePointer
	if json.Unmarshal(data, &pointer) != nil {
		return "", false
	}
	path, ok := cleanAbsolutePath(pointer.Path)
	if !ok || path == s.pointerPath {
		return "", false
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return "", false
	}
	if _, err := os.ReadFile(path); err != nil {
		return "", false
	}
	return path, true
}

func atomicWrite(path string, data []byte, secureDir bool) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	if secureDir {
		if err := os.Chmod(dir, 0700); err != nil {
			return err
		}
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return errors.New("invalid parent directory")
	}
	tmp, err := os.CreateTemp(dir, ".svg-designer-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func (s *preferenceStore) writePreferences(path string, prefs map[string]string) error {
	data, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	return atomicWrite(path, data, filepath.Dir(path) == s.defaultDir)
}

func (s *preferenceStore) writePointer(path string) error {
	data, err := json.Marshal(preferencePointer{Path: path})
	if err != nil {
		return err
	}
	return atomicWrite(s.pointerPath, data, true)
}

func (s *preferenceStore) readLocked() (map[string]string, error) {
	if s.pathErr != nil {
		return nil, s.pathErr
	}
	prefs, _, err := readPreferences(s.path)
	return prefs, err
}

func (s *preferenceStore) get() (map[string]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readLocked()
}

func (s *preferenceStore) set(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	prefs, err := s.readLocked()
	if err != nil {
		return err
	}
	prefs[key] = value
	return s.writePreferences(s.path, prefs)
}

func (s *preferenceStore) locationLocked() (preferenceLocation, error) {
	if s.pathErr != nil {
		return preferenceLocation{}, s.pathErr
	}
	return preferenceLocation{Path: s.path, IsDefault: s.path == s.defaultPath}, nil
}

func (s *preferenceStore) location() (preferenceLocation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.locationLocked()
}

func (s *preferenceStore) setLocation(requested *string) (preferenceLocation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pathErr != nil {
		return preferenceLocation{}, s.pathErr
	}
	target := s.defaultPath
	if requested != nil && *requested != "" {
		var ok bool
		target, ok = cleanAbsolutePath(*requested)
		if !ok {
			return preferenceLocation{}, errors.New("invalid path")
		}
	}
	if target == s.pointerPath || !regularOrMissing(target) {
		return preferenceLocation{}, errors.New("invalid path")
	}
	current, _, err := readPreferences(s.path)
	if err != nil {
		return preferenceLocation{}, err
	}
	targetPrefs, valid, err := readPreferences(target)
	if err != nil {
		return preferenceLocation{}, err
	}
	if !valid {
		targetPrefs = current
	}
	if err := s.writePreferences(target, targetPrefs); err != nil {
		return preferenceLocation{}, err
	}
	if err := s.writePointer(target); err != nil {
		return preferenceLocation{}, err
	}
	s.path = target
	return s.locationLocked()
}

func registerPreferenceHandlers(a *nexpkg.App) {
	store := newPreferenceStore()
	a.Handle("prefs.get", func(_ *nexpkg.Context, _ json.RawMessage) (any, error) {
		prefs, err := store.get()
		if err != nil {
			return nil, nexpkg.Errorf("internal", "unable to read preferences")
		}
		return prefs, nil
	})
	a.Handle("prefs.set", func(c *nexpkg.Context, params json.RawMessage) (any, error) {
		var p struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}
		if err := bindParams(c, params, &p); err != nil {
			return nil, err
		}
		if !validPreference(p.Key, p.Value) {
			return nil, nexpkg.Errorf("bad_request", "invalid preference")
		}
		if err := store.set(p.Key, p.Value); err != nil {
			return nil, nexpkg.Errorf("internal", "unable to save preference")
		}
		return map[string]any{"ok": true}, nil
	})
	a.Handle("prefs.location", func(_ *nexpkg.Context, _ json.RawMessage) (any, error) {
		location, err := store.location()
		if err != nil {
			return nil, nexpkg.Errorf("internal", "unable to read preferences location")
		}
		return location, nil
	})
	a.Handle("prefs.setLocation", func(c *nexpkg.Context, params json.RawMessage) (any, error) {
		var p struct {
			Path *string `json:"path"`
		}
		if err := bindParams(c, params, &p); err != nil {
			return nil, err
		}
		location, err := store.setLocation(p.Path)
		if err != nil {
			return nil, nexpkg.Errorf("bad_request", "invalid or unwritable path")
		}
		return location, nil
	})
}
