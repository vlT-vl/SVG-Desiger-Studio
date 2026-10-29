package main

import (
	"embed"
	"log"
	"os"
	"strings"
	"time"

	"nex/config"
	nexpkg "nex/nex"
)

const defaultUpdateURL = "https://github.com/vlT-vl/SVG-Desiger-Studio"

//go:embed frontend/dist
var distFS embed.FS

func main() {
	envFile := envDefault("NEX_ENV_FILE", ".env")
	envValues := config.Read(envFile)
	config.Load(envFile)

	appName    := envValue(envValues, "NEX_APP_NAME",    "SVG Designer Studio")
	appVersion := envValue(envValues, "NEX_APP_VERSION", AppVersion)
	appBuild   := envValue(envValues, "NEX_APP_BUILD",   AppBuild)
	appUpdated := envValue(envValues, "NEX_APP_UPDATED", AppUpdated)
	appAuthor  := envValue(envValues, "NEX_APP_AUTHOR",  AppAuthor)
	appIcon    := envValue(envValues, "NEX_APP_ICON",    "res/svgdesigner.png")
	appID      := envValue(envValues, "NEX_APP_ID",      "dev.vlt.svg-designer")

	log.Printf("%s %s (%s) starting on nex %s (%s); NEX_ENV=%s",
		appName, appVersion, appBuild, nexpkg.FrameworkVersion(), nexpkg.FrameworkBuild(), os.Getenv("NEX_ENV"))

	a := nexpkg.New(nexpkg.Config{
		SecurityPolicy:   svgDesignerSecurityPolicy{},
		Title:            appName,
		Width:            1440,
		Height:           900,
		Debug:            os.Getenv("APP_DEV") == "1",
		AppVersion:       appVersion,
		AppBuild:         appBuild,
		AppUpdated:       appUpdated,
		AppAuthor:        appAuthor,
		Icon:             appIcon,
		Dist:             distFS,
		DistDir:          "frontend/dist",
		DevServerURL:     envDefault("NEX_DEV_SERVER_URL", "http://127.0.0.1:5179"),
		IdleTimeout:      12 * time.Hour,
		EnvFile:          envFile,
		SingleInstanceID: appID,
		UpdateURL:        envValue(envValues, "NEX_UPDATE_URL", defaultUpdateURL),
	})

	registerPreferenceHandlers(a)

	if err := a.Run(); err != nil {
		log.Fatal(err)
	}
}

func envDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envValue(values map[string]string, key, fallback string) string {
	if v := strings.TrimSpace(values[key]); v != "" {
		return v
	}
	return envDefault(key, fallback)
}
