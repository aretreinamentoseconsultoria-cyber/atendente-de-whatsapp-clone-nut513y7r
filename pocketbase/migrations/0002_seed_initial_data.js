/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0002_seed_initial_data: migração legada desativada (conversas de demonstração foram purgadas)
    // Mantida vazia para compatibilidade com instalações existentes.
  },
  (app) => {},
)
