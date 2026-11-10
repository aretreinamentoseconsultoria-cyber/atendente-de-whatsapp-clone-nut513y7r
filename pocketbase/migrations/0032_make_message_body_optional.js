/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0032_make_message_body_optional: garantir body não obrigatório
    try {
      const messages = app.findCollectionByNameOrId('messages')
      if (messages) {
        const bodyField = messages.fields
          ? messages.fields.getByName('body')
          : messages.schema && messages.schema.getFieldByName('body')
        if (bodyField && bodyField.required) {
          bodyField.required = false
          app.save(messages)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
