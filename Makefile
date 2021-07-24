.PHONY: clean
clean:
	./scripts/clean.sh

.PHONY: ensure
ensure:
	./scripts/ensure.sh

.PHONY: publish
publish:
	./scripts/publish.sh

.PHONY: test-deploy
test-deploy:
	./scripts/test.sh up

.PHONY: test-destroy
test-destroy:
	./scripts/test.sh destroy
