define(['jquery', 'vendor/backbone', 'vendor/underscore', 'lib/components/base/modal', 'twigjs', 'lib/components/notes/notes', 'lib/components/base/player', 'lib/common/urlparams', 'lib/common/fn', 'vendor/jplayer'
], function ($, Backbone, _, Modal, twig, NotesWrapper, Player, url_params, Fn) {
  var CallResult, Notes;

  Notes = NotesWrapper.View.extend({
    noteSwitchToTask: function (e) {
      this.switchToTask({
        currentTarget: e.currentTarget
      });
    }
  });

  CallResult = Backbone.View.extend({
    tagName: "div",
    className: "js-call_result_modal",

    events: {
      'click .vox_imp__call_result__audio_delete': 'removeCallRecord',
      'focus .note-edit__textarea': 'modalCentrify',
      'blur .js-call_result__suggest-contact': 'blurSuggestContactCompany',
      'input .js-call_result__suggest': 'checkSuggestIcon',
      'suggest:loaded .js-call_result__suggest': 'showSuggestLoaded',
      'suggest:changed .js-call_result__suggest': 'changeSuggestIcon',
      'suggest:changed .js-call_result__suggest-contact': 'suggestContactCompanyChanged',
      'suggest:changed .js-call_result__suggest-lead': 'suggestLeadChanged',
      'click #js-modal-accept': 'saveResultStart'
    },

    initialize: function (params) {
      this.widget = params.widget;
      this.lang = this.widget.i18n('result_form');

      if (params.element) {
        this.set_element(params.element);
      }

      this.user = AMOCRM.constant('user');
      this.unsorted_api_key = AMOCRM.constant('unsorted_token');
      this.call_info = params.call_info;
      this.call_record = params.call_record;
      this.call_time = params.call_time / 1000;
      this.call_time = parseInt(this.call_time);
      this.need_page_reload = false;
      this.get_current_duration(this.call_record && this.call_record.url);
      this.result = {
        el: {}
      };
      if (!this.result.lead) {
        this.result.lead = {};
      }

      this.call_record.url = this.fixCallUrl(this.call_record.url);

      console.log('---------------------------');
      console.log('this.call_info: ', this.call_info);
      console.log('this.call_record: ', this.call_record);
      console.log('this.call_time: ', this.call_time);
      console.log('---------------------------');

      if (!AMOCRM.constant('task_types')) {
        $.ajax({
          url: '/ajax/get_task_types/',
          dataType: 'json'
        }).done(function (res) {
          AMOCRM.constant('task_types', res);
        });
      }

      this.linkSuggestElement(this.element);

      if (AMOCRM.data.current_entity == 'leads' && AMOCRM.data.current_card) {
        if (AMOCRM.data.current_card.id) {
          var lead_name = AMOCRM.data.current_card.$el.find('#person_name').val();
          this.result.lead = {
            id: AMOCRM.data.current_card.id,
            element_type: AMOCRM.element_types.leads,
            text: lead_name
          };
        }
      }

      new Modal({
        class_name: 'modal-list modal-widget',
        init: _.bind(function ($modal_body) {
          this.modal = $modal_body;
          $modal_body.html(this.$el);

          this.checkIfCardHasChanges();
        }, this),
        widget: this.widget,
        destroy: _.bind(this.destroy, this)
      });
    },

    fixCallUrl: function (url) {
      if (!url) {
        return url;
      }

      if (url.indexOf('http') !== 0) {
        return url;
      }

      if (url.indexOf('https') !== 0) {
        url = 'https' + url.substr(4);
      }

      return url;
    },

    destroy: function () {
      var CallsList = this.widget.__CallsList;

      CallsList.CallResult.saveCall({
        success: function () {
          if (this.need_page_reload) {
            CallsList.CallResult.reloadPage();
          }

          console.log('saveCall success arguments = ', arguments);
        },
        always: function () {
          console.log('saveCall always arguments = ', arguments);
        }
      });

      this.checkNotesChanges();

      $.ajax({
        url: '/private/api/v2/json/accounts/current',
        method: 'GET',
        success: _.bind(function (response) {
          if (response.response) {
            response = response.response;
          }

          if (response.account && response.account.custom_fields && response.account.custom_fields.contacts) {
            _.each(response.account.custom_fields.contacts, function (custom_field) {
              if (custom_field.code === 'PHONE') {
                this.addUnsorted(custom_field);
              }
            }, this);
          } else {
            console.log('get account info failed, response: ', response);
          }
        }, this)
      });

      CallsList.calls.remove(CallsList._list_current_call, ['silent']);
      CallsList.callEnded();
      CallsList.checkListState();//делаем следующий шаг
    },

    checkIfCardHasChanges: function () {
      if (AMOCRM.data.current_card &&
        AMOCRM.data.current_card.checkChanges()) {
        var elem_type = AMOCRM.data.current_card.element_type;
        AMOCRM.data.current_card.save({
          afterSave: _.bind(function (res) {
            console.log('afterSave arguments = ', arguments);
            var element = {
              id: res.id,
              element_type: elem_type,
              element: {
                element_id: res.id,
                text: res.name
              }
            };
            if (elem_type != AMOCRM.element_types.leads) {
              this.set_element(element);
              this.linkSuggestElement(element);
            }
            this.render();
          }, this)
        });
      } else {
        this.render();
      }
    },

    render: function () {
      var call_statuses = $.extend({}, AMOCRM.call_statuses);

      call_statuses.amo_call_status_success_conversation.selected = true;

      AMOCRM.addLang(this.widget.i18n('result_form'));

      this.element.element = this.element.element || {};

      if (this.element.element.text) {
        this.element.element.text = Fn.escapeHTML(this.element.element.text);
      }

      if (this.result.lead.text) {
        this.result.lead.text = Fn.escapeHTML(this.result.lead.text);
      }

      this.widget.getTemplate(
        'call_result',
        {},
        _.bind(function (template, base_params) {
          var notes_block = this.widget.render(
            {
              ref: '/tmpl/cards/notes/wrapper.twig'
            },
            {
              element_id: this.element.element_id || 1,
              current_user: this.user,
              managers: AMOCRM.constant('managers') || {},
              lang: $.extend({}, AMOCRM.lang, {
                note_placeholder: this.widget.i18n('result_form').note_placeholder,
                task_placeholder: this.widget.i18n('result_form').task_placeholder
              }),
              task_types: AMOCRM.constant('task_types') || {},
              file_button: {
                url: 'where'
              }
            }
          ),
            $notes_block = $(notes_block);

          $notes_block.find('.task-edit__footer').hide();

          this.$el.html(template.render(_.extend(base_params, {
            notes_block: $('<div>').append($notes_block.clone()).html(),
            suggest: this.widget.render(
              {
                ref: '/tmpl/controls/suggest.twig'
              },
              {
                selected: this.element.element.text,
                value_id: this.element.element_id,
                class_name: 'call_result__suggest',
                input_class_name: 'js-call_result__suggest js-call_result__suggest-contact',
                placeholder: this.widget.i18n('result_form').contact_placeholder,
                ajax: {
                  url: '/private/ajax/search.php',
                  params: 'contacts=all&q=#q#'
                }
              }
            ),
            lead_suggest: this.widget.render(
              {
                ref: '/tmpl/controls/suggest.twig'
              },
              {
                selected: this.result.lead.text,
                value_id: this.result.lead.id,
                class_name: 'call_result__suggest',
                input_class_name: 'js-call_result__suggest js-call_result__suggest-lead',
                placeholder: this.widget.i18n('result_form').lead_placeholder,
                ajax: {
                  url: '/private/ajax/search.php',
                  params: 'type=deals&q=#q#'
                }
              }
            ),
            lead_linked: !!(this.result.lead.id),
            element: this.element,
            record: this.call_record,
            duration: this.call_time,
            phone: this.call_record.to,
            result_options: call_statuses,
            lang: this.lang
          })));
          console.log('this.call_record = ', this.call_record);

          this.modal
            .trigger('modal:loaded')
            .trigger('modal:centrify');

          if (!this.player) {
            this.player = new Player({
              selector: '#vox_recorded_talk',
              $container: this.$el
            });
          }

          if (this.element.element_id) {
            this.linkSuggestElement({
              id: this.element.element_id,
              element_type: this.element.type
            });
          }

          this.notes_view = new Notes({
            element_type: this.element.type,
            user: this.user.id,
            el: this.modal.find('.notes-wrapper'),
            no_player: true
          });

          this.notes_view.notes.on('notes:updated', _.bind(function () {
            setTimeout(_.bind(function () {
              this.modal.trigger('modal:centrify');
            }, this), 300);
          }, this));
        }, this)
      );
    },

    set_element: function (element) {
      this.element = {
        id: element.id || element.element_id,
        element_type: element.element_type || element.type,
        entity: element.entity,
        element: element.element
      };

      this.first_linked_element = this.element;
    },

    addLinkIcon: function (type) {
      this.$el.find('.vox_imp__call_result__common.' + type).addClass('element_linked');
    },

    removeLinkIcon: function (type) {
      this.$el.find('.vox_imp__call_result__common.' + type).removeClass('element_linked');
    },

    checkSuggestIcon: function (e) {
      var $this = $(e.currentTarget),
        type = $this.closest('.vox_imp__call_result__common').hasClass('contact') ? 'contact' : 'lead';

      $this.removeAttr('data-value-id');
      this.removeLinkIcon(type);
      this.result[type == 'contact' ? 'el' : 'lead'] = {};
    },

    get_current_duration: function (url) {
      var _this = this;

      url = url || false;
      if (url) {
        $('<div id="get_current_duration"></div>').jPlayer({
          ready: function () {
            $(this).jPlayer("setMedia", {
              mp3: url
            });
          },
          loadeddata: function (event) { // calls after setting the song duration
            var songDuration = event.jPlayer.status.duration;
            songDuration = parseInt(songDuration);
            _this.call_time = songDuration;

            $(this).jPlayer('destroy');
          },
          supplied: "mp3"
        });
      } else {
        _this.call_time = 0;
      }
    },

    blurSuggestContactCompany: function (e) {
      var $this = $(e.currentTarget),
        new_suggest_value = this.first_linked_element.element.text;

      if (!$this.val()) {
        if (this.first_linked_element.company && this.first_linked_element.company.name) {
          new_suggest_value += ', ' + this.first_linked_element.company.name;
        }

        if (new_suggest_value) {
          $this.val(new_suggest_value);

          this.linkSuggestElement({
            id: this.first_linked_element.id,
            element_type: this.first_linked_element.type
          });
        }
      }
    },

    suggestContactCompanyChanged: function (e, $li) {
      this.linkSuggestElement({
        id: $li.data('value-id'),
        element_type: $li.data('element_type')
      });
    },

    suggestLeadChanged: function (e, $li) {
      this.result.lead = {
        id: $li.data('value-id'),
        element_type: AMOCRM.element_types.leads
      };
    },

    changeSuggestIcon: function (e) {
      this.addLinkIcon($(e.currentTarget).closest('.vox_imp__call_result__common').hasClass('contact') ? 'contact' : 'lead');
    },

    showSuggestLoaded: function (e, data, $ul) {
      var items = [];

      data = data || {};
      if (data.status == 'ok') {
        $.each(data.result, function (e, row) {
          items.push({
            id: row.id,
            text: row.name,
            additional_data: ' data-element_type="' + row.element_type + '" '
          });
        });
      }

      $ul.trigger('suggest:reset', [items]);
    },

    linkSuggestElement: function (element) {
      if (typeof element == 'object') {
        this.result.el = element;
      } else {
        console.log('empty element in suggest');
      }

      this.addLinkIcon('contact');
    },

    generateTasks: function () {
      var tasks = [], task;

      this.notes_view.notes.each(function (model) {
        var model_params = model.get('params');

        task = {
          task_type: model_params.type,
          complete_till: model.get('date'),
          text: model_params.text
        };

        tasks.push(task);
      }, this);

      return tasks;
    },

    generateNote: function (note) {
      var element_id, element_type;

      if (this.result.el && this.result.el.id) {
        element_id = this.result.el.id;
      }

      if (this.result.el && this.result.el.element_type) {
        element_type = this.result.el.element_type;
      }

      if (!this.call_record.id) {
        this.call_record.id = Math.random().toString(36).slice(2) + '.' + Date.now();
      }

      return _.extend({
        element_id: element_id,
        element_type: element_type,
        note_type: this.call_record.note_type || 11,
        text: JSON.stringify({
          UNIQ: this.call_record.id,
          PHONE: this.call_record.to,
          DURATION: this.call_time,
          FROM: this.call_record.from,
          SRC: this.widget.params.widget_code,
          call_result: this.$('.js-note-add-textarea').val(),
          call_status: this.$('.control--select--list--item-selected').attr('data-value') || AMOCRM.call_statuses.amo_call_status_fail_not_phoned.value,
          LINK: this.call_record.url
        })
      }, note);
    },

    addUnsorted: function (custom_field) {
      if (this.result.el.id || this.result.lead.id) {
        // Contact or lead already created
        return;
      }
      if (this.call_record.note_type !== 10) {
        // Only inbound calls must be added to unsorted
        return;
      }

      custom_field = _.extend({
        id: 0,
        enums: {},
        code: 'PHONE'
      }, custom_field);

      var
        now = Math.round((+new Date()) / 1000),
        data = {
          leads: [{
            name: this.lang.incoming_call_from + this.call_record.to,
            tasks: this.generateTasks()
          }],
          contacts: [{
            name: this.lang.contact_name + this.call_record.to,
            notes: [
              this.generateNote({date_create: now})
            ],
            custom_fields: [{
              id: custom_field.id,
              values: [{
                'enum': Object.keys(custom_field.enums)[0],
                value: this.call_record.to
              }]
            }]
          }]
        },
        unsorted = {
          source_data: {
            from: this.call_record.to,
            to: this.user && this.user.id ? this.user.id : this.call_record.from,
            date: now,
            duration: this.call_time,
            link: this.call_record.url,
            service: this.widget.params.widget_code
          },
          data: data,
          source: this.call_record.from
        },
        keys = [
          'api_key=' + this.unsorted_api_key,
          'user_id=' + this.user.id
        ];

      $.ajax({
        headers: {
          Accept: "application/json"
        },
        page_xhr: false,
        destroy_view: false,
        type: 'POST',
        url: '/api/unsorted/add/?' + keys.join('&'),
        data: {
          request: {
            unsorted: {
              category: 'sip',
              add: [unsorted]
            }
          }
        },
        dataType: 'json'
      }).always(_.bind(function () {
        console.log('Unsorted add result arguments = ', arguments);
        this.reloadPage();
      }, this));
    },

    saveResultStart: function () {
      this.$('#js-modal-accept').trigger('button:save:start');

      if (!this.$('.js-call_result__suggest-contact').val() && !this.$('.js-call_result__suggest-lead').val()) {
        if (!this.notesHas('attachement')) {
          this.$('#js-call-result-cancel').click();
          return;
        }
      }

      this.createNewElements({
        error: _.bind(function () {
          this.$('#js-modal-accept').trigger('button:load:stop');

          this.widget.notifers.show_message_error({
            text: 'cant create new element'
          });
        }, this),
        complete: _.bind(function () {
          this.createSlaveElements();
        }, this)
      });
    },

    apiCall: function (params) {
      var data = {request: {}},
        method = params.method || 'add',
        dir = params.api_dir || params.type;

      data['request'][params.type] = {};
      data['request'][params.type][method] = [params.data];

      $.ajax({
        url: '/private/api/v2/json/' + dir + '/set',
        data: data,
        method: 'POST'
      }).always(_.bind(function (data) {
        data = data.response;
        console.log('createNewElement after ajax, arguments = ', arguments);

        if ((!data[params.type] || !data[params.type][method]) && method != 'update') {
          this.widget.notifers.show_message_error({
            text: data.error,
            without_header: true
          });

          params.error.call(this);
        } else {
          this.need_page_reload = true;

          params.success.call(this, {
            id: data[params.type] && data[params.type][method] && data[params.type][method][0].id,
            element_type: AMOCRM.element_types[params.type]
          });
        }
      }, this));
    },

    createNewElements: function (params) {
      var callbacks = {
          complete: params.complete || function () {
          },
          error: params.error || function () {
          }
        },
        contact_def = $.Deferred(),
        lead_def = $.Deferred(),
        contact_id,
        lead_id;

      if (!this.result.lead) {
        this.result.lead = {};
      }

      if (!this.result.el) {
        this.result.el = {};
      }

      lead_def.done(_.bind(function () {
        var options = {
          type: 'contacts',
          error: _.bind(function () {
          }, this)
        };

        if (this.result.el.id) {
          contact_id = this.result.el.id;
          options = _.extend({
            api_dir: this.result.el.element_type == 1 ? 'contacts' : 'company',
            method: 'update',
            data: {
              id: contact_id,
              linked_leads_id: [lead_id],
              last_modified: (+new Date())
            },
            success: _.bind(function () {
              contact_def.resolve();
            }, this)
          }, options);
        } else {
          options = _.extend(options, {
            data: {
              name: this.$('.js-call_result__suggest-contact').val() || this.lang.empty_name,
              linked_lead_id: lead_id
            },
            success: _.bind(function (data) {
              this.result.el = {
                id: data.id,
                element_type: data.element_type // contact always
              };

              contact_id = data.id;
              contact_def.resolve();
            }, this)
          });
        }

        this.apiCall(options);
      }, this));

      if (!this.result.lead.id && this.$('.js-call_result__suggest-lead').val()) {
        this.apiCall({
          type: 'leads',
          data: {
            name: this.$('.js-call_result__suggest-lead').val() || '0'
          },
          error: function () {
          },
          success: _.bind(function (data) {
            this.result.lead = {
              id: data.id,
              element_type: data.element_type
            };

            lead_id = data.id;
            lead_def.resolve();
          }, this)
        });
      } else {
        lead_id = this.result.lead.id;
        lead_def.resolve();
      }

      $.when(contact_def, lead_def).done(function () {
        var cb = 'complete';
        if (!contact_id && !lead_id) {
          cb = 'error';
        }

        callbacks[cb]({
          data: {
            contact_id: contact_id,
            lead_id: lead_id
          }
        });
      });
    },

    createSlaveElements: function (params) {
      this.saveNotes(params);
      this.$('#js-call-result-cancel').click();
      // this.modal_obj.destroy();
    },

    reloadPage: function () {
      $(document).trigger('page:reload');
    },

    saveNotes: function (params) {
      this.checkNotesChanges();

      if (this.notes_view.notes.length > 0) {
        this.notes_view.notes.each(function (model) {
          var model_params = model.get('params'),
            task_element = this.result.lead && this.result.lead.id ? this.result.lead : this.result.el,
            can_save = false;

          switch (model.get('type')) {
            case 'task':
              model_params.changed = {
                text: model_params.text,
                main_user: model_params.main_user.id,
                type: model_params.type,
                date: model.get('date')
              };

              model_params.element_type = task_element.element_type;
              model.set({
                params: model_params,
                element_id: task_element.id,
                element_type: task_element.element_type
              });

              can_save = true;
              break;

            case 'attachement':
              model_params.element_type = this.result.el.element_type;
              model.set({
                params: model_params,
                element_id: this.result.el.id,
                element_type: this.result.el.element_type
              });

              can_save = true;
              break;
          }

          if (can_save) {
            model.addCommit({
              success: function (data) {
                console.log('model.addCommit.success [this, arguments] = ', [this, arguments]);
              },
              error: function (data) {
                console.log('model.addCommit.error [this, arguments] = ', [this, arguments]);
              }
            });
          }
        }, this);

        this.need_page_reload = true;
      } else {
        console.log('no notes');
      }
    },

    checkNotesChanges: function () {
      // сохраним задачу, если она только создается
      if (this.notes_view.add_task_model.get('has_changes')) {
        this.notes_view.add_task.saveClick();
      }
    },

    notesHas: function (type) {
      var result = false;
      this.checkNotesChanges();

      if (this.notes_view.notes.length > 0) {
        this.notes_view.notes.each(function (model) {
          if (model.get('type') === type) {
            result = true;
          }
        }, this);
      }

      return result;
    },

    removeCallRecord: function () {
      this.$el.find('#vox_recorded_talk').remove();
      this.modal.trigger('modal:centrify');

      // сотрем `url`, чтобы не сохранилась запись в примечание
      if (this.call_record) {
        this.call_record.url = '';
      }
    },

    saveCall: function (params) {
      //убираем это дело, чтобы было примечание по приватным звонкам
      //if (!this.widget.__CallsList.$el.find('#vox_imp__rec_call').hasClass('rec_is_on')) {
      //  return true;
      //}

      params = params || {};
      this.call_record = this.call_record || {};

      this.addRecordAjax({
        success: _.bind(function () {
          this.$('#js-modal-accept').trigger('button:saved');
          this.need_page_reload = true;

          params.success.call(this);
        }, this),
        always: _.bind(function () {
          this.$('#js-modal-accept').trigger('button:load:stop');

          params.always.call();
        }, this),
        data: this.generateNote()
      });
    },

    addRecordAjax: function (params) {
      var note = params.data || {};

      $.ajax({
        url: '/private/api/v2/json/notes/set',
        method: 'POST',
        data: {
          request: {
            notes: {
              add: [note]
            }
          }
        }
      }).complete(_.bind(function () {
        if (typeof params.always === 'function') {
          params.always.call(this);
        }
      }, this)).done(_.bind(function () {
        if (typeof params.success === 'function') {
          params.success.call(this);
        }
      }, this));
    },

    modalCentrify: function () {
      this.modal.trigger('modal:centrify');
    }
  });

  return CallResult;
});