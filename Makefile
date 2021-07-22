.PHONY: clean
clean:
	./scripts/clean.sh

.PHONY: ensure
ensure:
	./scripts/ensure.sh

.PHONY: publish
publish:
	./scripts/publish.sh

.PHONY: test
test:
	./scripts/test.sh
