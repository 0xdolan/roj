UUID     := roj@0xdolan.github.io
VERSION  := $(shell python3 -c 'import json;print(json.load(open("extension/metadata.json"))["version-name"])')
EXT_DIR  := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP      := dist/$(UUID).shell-extension.zip
FILES    := $(shell cat scripts/extension-files)
JS_FILES := $(shell find extension scripts tests docs/calendar -name '*.js' -o -name '*.mjs')

# System-wide install (packages, tarball users): make install-system PREFIX=/usr
PREFIX   ?= /usr/local
DESTDIR  ?=
SHARE    := $(DESTDIR)$(PREFIX)/share
BINDIR   := $(DESTDIR)$(PREFIX)/bin
USER_BIN := $(HOME)/.local/bin

.PHONY: help test lint i18n schemas icons pack install uninstall dev-link install-system \
        dist deb calendars checksums release-assets vendor web screenshots marketing clean

help:
	@echo "Roj $(VERSION)"
	@echo
	@echo "  make install         install the extension and the roj command for your user"
	@echo "  make uninstall       remove both again"
	@echo "  make dev-link        use this checkout as the installed extension"
	@echo "  make install-system  install for every user (PREFIX=/usr/local, DESTDIR=)"
	@echo
	@echo "  make test            lint, translations and unit tests"
	@echo "  make pack            $(ZIP) for extensions.gnome.org"
	@echo "  make dist            dist/roj-$(VERSION).tar.gz source tarball"
	@echo "  make deb             dist/roj_*.deb and dist/gnome-shell-extension-roj_*.deb"
	@echo "  make release-assets  all of the above plus SHA256SUMS"
	@echo
	@echo "  make i18n            list untranslated interface messages"
	@echo "  make vendor          update the bundled tsroj engine (TSROJ=latest|x.y.z)"
	@echo "  make web             rebuild the website calendar files from the extension"
	@echo "  make icons           regenerate the logo and icons"
	@echo "  make screenshots     capture screenshots in a sandboxed, headless GNOME Shell"
	@echo "  make marketing       render the banner and store images"

# Quality

test: lint i18n
	node --test tests/*.test.js
	GSETTINGS_BACKEND=memory gjs -m tests/config.gjs.js
	gjs -m extension/cli/roj.js --no-config convert 2026-06-26 --to kurdish | grep -qx 2726-04-05
	node scripts/build-web.mjs --check

lint: schemas
	@for f in $(JS_FILES); do node --check "$$f" || exit 1; done
	@echo "syntax ok: $(words $(JS_FILES)) files"
	scripts/check-dashes.sh
	node scripts/check-kurdish.mjs

i18n:
	node scripts/i18n-check.mjs

schemas:
	glib-compile-schemas --strict extension/schemas

# Installing for your user

install: pack
	gnome-extensions install --force $(ZIP)
	glib-compile-schemas $(EXT_DIR)/schemas
	gnome-extensions enable $(UUID) || true
	@$(MAKE) --no-print-directory install-user-cli CLI_SCRIPT=$(EXT_DIR)/cli/roj.js
	@echo
	@echo "Installed Roj $(VERSION). On Wayland, log out and back in once so GNOME Shell loads it."

install-user-cli:
	install -d $(USER_BIN) $(HOME)/.local/share/man/man1
	scripts/write-launcher.sh "$(CLI_SCRIPT)" $(USER_BIN)/roj
	install -m 644 man/roj.1 $(HOME)/.local/share/man/man1/roj.1
	@case ":$$PATH:" in *":$(USER_BIN):"*) echo "roj command: $(USER_BIN)/roj";; \
		*) echo "roj command: $(USER_BIN)/roj (add $(USER_BIN) to your PATH, or open a new terminal)";; esac

uninstall:
	gnome-extensions uninstall $(UUID) || true
	@if grep -q 'roj, the Kurdish calendar' $(USER_BIN)/roj 2>/dev/null; then command rm -f $(USER_BIN)/roj; fi
	command rm -f $(HOME)/.local/share/man/man1/roj.1

dev-link: schemas
	mkdir -p $(dir $(EXT_DIR))
	ln -sfn $(CURDIR)/extension $(EXT_DIR)
	@$(MAKE) --no-print-directory install-user-cli CLI_SCRIPT=$(CURDIR)/extension/cli/roj.js
	@echo "Linked $(EXT_DIR) to extension/. Log out and in, then: gnome-extensions enable $(UUID)"

# Installing for every user

install-system:
	install -d $(SHARE)/gnome-shell/extensions/$(UUID) $(SHARE)/glib-2.0/schemas
	cd extension && tar cf - --exclude='gschemas.compiled' $(FILES) | tar xf - -C $(SHARE)/gnome-shell/extensions/$(UUID)
	install -m 644 extension/schemas/org.gnome.shell.extensions.roj.gschema.xml $(SHARE)/glib-2.0/schemas/
	install -d $(SHARE)/roj $(BINDIR) $(SHARE)/man/man1
	cd extension && tar cf - cli lib locale data | tar xf - -C $(SHARE)/roj
	scripts/write-launcher.sh $(PREFIX)/share/roj/cli/roj.js $(BINDIR)/roj
	install -m 644 man/roj.1 $(SHARE)/man/man1/roj.1
	@if [ -z "$(DESTDIR)" ]; then glib-compile-schemas $(SHARE)/glib-2.0/schemas; fi

# Release artifacts

pack:
	scripts/pack.sh

dist:
	mkdir -p dist
	git archive --format=tar.gz --prefix=roj-$(VERSION)/ -o dist/roj-$(VERSION).tar.gz HEAD
	@echo "dist/roj-$(VERSION).tar.gz (from the last commit)"

deb:
	scripts/build-deb.sh

calendars:
	mkdir -p dist
	cp docs/calendar/kurdish-events-*.ics dist/

checksums:
	cd dist && sha256sum *.zip *.tar.gz *.deb *.ics > SHA256SUMS && cat SHA256SUMS

release-assets: test pack dist deb calendars checksums

# Maintenance

web:
	node scripts/build-web.mjs

vendor:
	scripts/vendor-tsroj.sh $(or $(TSROJ),latest)
	$(MAKE) test

icons:
	python3 scripts/make-logo.py
	@for s in 16 32 48 64 128 256 512 1024; do \
		inkscape assets/logo.svg -o assets/logo-$$s.png -w $$s -h $$s >/dev/null 2>&1; done
	cp assets/logo-512.png assets/logo.png
	inkscape extension/icons/roj-symbolic.svg -o assets/icon-symbolic-64.png -w 64 -h 64 >/dev/null 2>&1
	cp assets/logo.svg docs/images/logo.svg && cp assets/logo-256.png docs/images/logo-256.png
	convert assets/logo-16.png assets/logo-32.png assets/logo-48.png docs/favicon.ico

screenshots:
	scripts/screenshots.sh

marketing:
	scripts/marketing/render.sh

clean:
	command rm -rf build dist extension/schemas/gschemas.compiled
