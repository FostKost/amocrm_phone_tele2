define(['jquery', 'lib/common/router', 'lib/common/fn'], function ($, router, Fn) {

  var IncomingCall = Backbone.View.extend({

    tagName: "div",
    className: "call_notify",
    id: 'call_popup_notify',
    initialize: function (params) {
      var _this = this,
        phone = '';

      this.answered = false;
      this.calls_list = params.calls_list;
      this.widget = params.widget;

      this.call = params.call;
      this.call_from_storage = params.call_from_storage;

      this.$popups_wrapper = $('#popups_wrapper');
      if (params.call_from_storage) {
        phone = this.call.phone;
      } else {
        phone = this.call.number();
        phone = this.prepare_phone(phone);
      }

      this.phone = phone;

      console.log(params.call_from_storage);
      if (!params.call_from_storage) {
        if (phone.length > 5) {
          this.search(phone, {
            success: function (element) {
              var storage_params = {
                phone: phone
              };
              storage_params.element = _this.element = element;
              storage_params.date = Math.floor(Math.random() * (99999 - 1)) + 1;
              _this.render();
              if (!params.call_from_storage) {
                console.log(phone);
                localStorage.setItem(_this.widget.params.widget_code + '_incoming_call', JSON.stringify(storage_params));
              }
            }
          });
        } else {
          this.element = params.element;
          this.render();
          localStorage.setItem(
            _this.widget.params.widget_code + '_incoming_call',
            JSON.stringify({
              phone: phone,
              date: Math.floor(Math.random() * (99999 - 1)) + 1
            })
          );
        }
        this.bindCallEventsListener();
      } else {
        this.element = params.element;
        this.render();

      }
    },

    events: {
      "click .js-incoming-answer": 'answer',
      "click .js-incoming-hangup": 'hangup',
      "click .js-incoming-answer-with-card": 'answerAndOpen'
    },

    prepare_phone: function (phone) {
      phone = phone || false;
      if (phone) {
        phone = phone.split('@');
        if (phone.length > 1) {
          phone = phone[0];
          if (phone.length > 10) {
            phone = phone.substr(-10);
          } else {
            phone = phone.replace('sip:', '');
          }
          return phone;
        }
      }
      return false;
    },

    search: function (phone, callbacks) {
      callbacks = callbacks || {};
      callbacks.success = callbacks.success || function () {
        };
      phone = phone ? phone.toString() : '';
      if (phone.length > 0) {
        $.ajax(
          '/private/api/v2/json/contacts/list',
          {
            method: 'GET',
            data: {
              query: phone,
              type: 'all'
            },
            timeout: 1000 * 5,
            complete: function (data, status) {
              if (status != 'timeout') {
                data = data.responseJSON || false;
                if (typeof data == 'object') {
                  data = data.response.contacts[0];
                } else {
                  data = false;
                }
                callbacks.success(data);
              }
            }
          }
        );
      }
    },

    answer: function () {
      if (this.call_from_storage) {
        localStorage.setItem(this.widget.params.widget_code + '_incoming_call_answer', Math.floor(Math.random() * (99999 - 1)) + 1);
      } else {
        if (this.call.active()) {
          if (this.calls_list.$el.find('#vox_imp__call_list_wrapper').hasClass('expanded')) {
            this.calls_list.openCallList();
          }
          this.call.answer();
        }
      }
    },

    hangup: function () {
      console.log('hangup called!');
      console.log('arguments = ', arguments);
      console.log('this.call_from_storage = ', this.call_from_storage);
      if (this.call_from_storage) {
        console.log(this.widget.params.widget_code + '_incoming_call_hangup');
        localStorage.setItem(this.widget.params.widget_code + '_incoming_call_hangup', Math.floor(Math.random() * (99999 - 1)) + 1);
      } else {
        var call_active = this.call.active();
        console.log('call_active = ', call_active);
        if (this.call.active()) {
          if (this.call.state() == 'CONNECTED') {
            this.call.hangup();
          } else {
            this.call.decline();
            this.calls_list.$el.trigger('call:disconnected', [true]);
          }
        }
      }
    },

    answerAndOpen: function () {
      if (this.call_from_storage) {
        console.log('_incoming_call_answerAndOpen');
        localStorage.setItem(this.widget.params.widget_code + '_incoming_call_answerAndOpen', Math.floor(Math.random() * (99999 - 1)) + 1);
        router.navigate($('#incoming_from').attr('href'), {trigger: true, replace: true});
      } else {
        this.open_card = true;
        this.answer();
      }
    },

    render: function () {
      var _this = this,
        el_url = '/#TYPE#/detail/',
        el_types = {
          'contact': 'contacts',
          'company': 'companies'
        },
        template_params = {
          lang: _this.widget.i18n('incoming')
        };

      template_params.phone = this.phone;
      console.log(this.phone);
      console.log(this.element);
      if (this.element) {
        template_params.element_id = this.element.id;// для
        template_params.type = AMOCRM.element_types[el_types[this.element.type]];// результата звонка

        template_params.element = {
          text: Fn.escapeHTML(this.element.name),
          url: el_url.replace('#TYPE#', el_types[this.element.type]) + this.element.id
        };
        if (this.element.linked_company_id && this.element.linked_company_id.length > 0) {
          template_params.company = {
            name: this.element.company_name,
            url: el_url.replace('#TYPE#', el_types.company) + this.element.linked_company_id
          }
        }
      }

      this.widget.getTemplate('call_notification', {}, function (template, base_params) {
        _this.widget.__CallsList.$el.hide();
        _this.$el.html(template.render(_.extend(base_params, template_params)));
      });
      this.element_info = template_params;
      this.$popups_wrapper.prepend(this.$el);
    },

    destroy: function () {
      if (this.calls_list.is_parent_widget) {
        localStorage.setItem(
          this.widget.params.widget_code + '_IncomingCall_destroy',
          JSON.stringify({time: (+new Date())})
        );
      }
      this.$el.remove();
      this.remove();
    },

    bindCallEventsListener: function () {
      var _this = this;
      if (this.call) {
        this.calls_list.once('call:hangup', function () {
          _this.call.hangup();
        });

        this.call.addEventListener(VoxImplant.CallEvents.Connected, function (e) {
          _this.answered = true;
          _this.calls_list._call_interval = 0;
          _this.calls_list.start_calling_interval(0);
          _this.calls_list.trigger('list:change_call_status', [true, 'incomming']);

          if (_this.open_card) {
            router.navigate($('#incoming_from').attr('href'), {trigger: true, replace: true});
          }

          _this.calls_list._now_calling.element_info = _this.element_info;
          _this.widget.getTemplate(
            'call_status',
            {},
            function (template, base_params) {
              _this.calls_list.$el.find('.amo__vox__implant_call__status__contact').html(template.render(_.extend(base_params, {
                lang: _this.calls_list.lang,
                call_type: 10,
                phone: _this.phone,
                element: _this.element_info.element
              })));
              _this.$el.hide();
              _this.calls_list.trigger('list:change_call_status', [true, 'incomming', _this.phone, _this.element_info]);
//                            this.trigger('list:change_call_status',[true, 'outcomming', phone, element_info]);
              _this.calls_list.$el.show();
            }
          );
          _this.calls_list.$el.trigger('call:connected');
          if (_this.calls_list.$el.find('#vox_imp__rec_call').hasClass('rec_is_on')) {
            _this.call.sendMessage('start_recording');
          }
          if (_this.calls_list._now_calling && !_this.call_from_storage) {
            var now_calling_data = _.extend({}, _this.calls_list._now_calling);
            now_calling_data.call_time = 0;
            _this.calls_list.is_parent_widget = true;
            localStorage.setItem(_this.widget.params.widget_code + '_current_call', JSON.stringify(now_calling_data));
          } else {
            console.log('NOOOOOOO');
          }
        });

        this.call.addEventListener(VoxImplant.CallEvents.Disconnected, function () {
          console.log('VoxImplant.CallEvents.Disconnected called!');
          console.log('arguments = ', arguments);
          if (_this.element && _this.element.id && _this.widget.__CallsList._now_calling) {
            _this.widget.__CallsList._now_calling.phone = _this.phone;
            var element = {
              element_id: _this.element.id,
              element_type: (_this.element.type == 'contact') ? 1 : 3,
              entity: _this.element.type,
              element: {
                text: _this.element.name,
                url: (_this.element.type == 'contact') ? '/contacts/detail/' + _this.element.id : '/companies/detail/' + _this.element.id
              }
            };
            _this.widget.__CallsList._now_calling.element_info = _.extend({}, element);
          }
          if (!_this.call_from_storage) {
            if (_this.answered) {
              localStorage.setItem(_this.widget.params.widget_code + '_call_result_edit',
                JSON.stringify({
                  element_info: element,
                  call_record: _this.widget.__CallsList.call_record,
                  _call_time: _this.widget.__CallsList._call_time
                })
              );
              if (_this.calls_list.is_parent_widget) {
                _this.calls_list.$el.trigger('call:disconnected', [false, true]);
              }
            } else {
              _this._now_calling = false;
              if (_this.calls_list.is_parent_widget) {
                _this.calls_list.$el.trigger('call:disconnected', [true]);
              }
            }
          }
          _this.destroy();
        });

        this.call.addEventListener(VoxImplant.CallEvents.MessageReceived, function (e) {
          console.log(e);
          if (typeof e.text == 'string') {
            var data = JSON.parse(e.text) || {};
            if (data.type == 'record_url') {
              data.note_type = 10;
              _this.calls_list.call_record = data;
            }
          }
        });
      }
    }

  });

  return IncomingCall;
});