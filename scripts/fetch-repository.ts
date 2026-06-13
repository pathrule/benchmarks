import {
  ensureRepositoryCheckout,
  loadRepositorySpec,
} from "../harness/fixtures/repository.js";

const root = process.cwd();
const spec = loadRepositorySpec(root);
const checkout = ensureRepositoryCheckout(root, spec);
console.log(`${spec.name}@${spec.tag} ${spec.commit}`);
console.log(checkout);
