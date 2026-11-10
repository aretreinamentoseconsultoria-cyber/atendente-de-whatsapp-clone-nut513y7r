/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 0033_add_media_and_transcription_to_messages: garantir campos de mídia caso ainda faltem
    try {
      const messages = app.findCollectionByNameOrId('messages')
      if (messages) {
        let modified = false

        if (!messages.fields.getByName('message_type')) {
          messages.fields.add(
            new SelectField({
              name: 'message_type',
              required: false,
              maxSelect: 1,
              values: ['text', 'audio', 'image', 'document', 'template', 'video'],
            }),
          )
          modified = true
        }
        if (!messages.fields.getByName('media_url')) {
          messages.fields.add(new TextField({ name: 'media_url', required: false }))
          modified = true
        }
        if (!messages.fields.getByName('transcription')) {
          messages.fields.add(new TextField({ name: 'transcription', required: false }))
          modified = true
        }
        if (!messages.fields.getByName('media_duration')) {
          messages.fields.add(new NumberField({ name: 'media_duration', required: false }))
          modified = true
        }
        if (!messages.fields.getByName('file_name')) {
          messages.fields.add(new TextField({ name: 'file_name', required: false }))
          modified = true
        }
        if (!messages.fields.getByName('file_size')) {
          messages.fields.add(new NumberField({ name: 'file_size', required: false }))
          modified = true
        }

        if (modified) {
          app.save(messages)
        }
      }
    } catch (_) {}
  },
  (app) => {},
)
