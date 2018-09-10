define(['jquery',
  'intl_tel_input',
  'vendor/underscore',
  'lib/common/cookie',
  'lib/components/base/modal',
  'lib/common/fn',
  'twigjs',
  'lib/common/router',
  window.location.origin + '/widgets/amo__vox__implant/incoming_call.js',
  window.location.origin + '/widgets/amo__vox__implant/storage_mgmt.js',
  window.location.origin + '/widgets/amo__vox__implant/auth_form.js',
  window.location.origin + '/widgets/amo__vox__implant/call_result_fail.js',
  window.location.origin + '/widgets/amo__vox__implant/visibility.js'
], function ($, iti, _, cookie, Modal, Fn, twig, router, IncomingCall, StorageMGMT, AuthForm, CallResultFail) {

  var off_time = 1000;

  var Calls = {
    Collection: Backbone.Collection.extend({
      comparator: function (call) {
        return call.get("sort");
      }
    }),
    View: Backbone.View.extend({
      tagName: 'div',

      className: 'amo__vox__implant_vox_implant_call amo__vox__implant_call',

      initialize: function (params) {
        var _this = this;
        this._Call = params.Call;
        this._CallResult = params.CallResult;
        this.widget = params.widget;

        this.lang = params.lang || {};
        this.calls = new Calls.Collection();
        this.sip_params = params.sip_params;

        this.ready = false;
        this._list_current_call = false;//модель текущего звонка
        this._now_calling = false;
        this._list_interval = false;//интервал до звонка
        this._list_paused = true;

        this.active = true;
        this._call_interval = false;
        this._call_open_contact = !(cookie.get(this.widget.params.widget_code + '_open_contact') == '0');

        this.$el.hide();
        this.render(params.calls);

        this.listenTo(this.calls, "add", this.bindViews);
        this.listenTo(this.calls, "change add remove", this.checkListState);

        this.listenTo(this.calls, "reset", function () {
          this.$el.addClass('empty_calls_list');
          $(document).trigger('list:cookies:update');
        });

        this.on('list:play', this.listPlay);

        this.once('vox:auth:success', function () {
          $('body').append(this.$el);
          // покажем вместо иконки нотификац$ий разделенную иконку на нотификации и звонки
          AMOCRM.widgets.notificationsPhone({
            ns: this.widget.ns,
            click: _.bind(function () {
              this.$el.toggle();
              if (this.$el.is(":visible")) {
                $('body').addClass('vox_panel');
              } else {
                $('body').removeClass('vox_panel');
              }
            }, this)
          });

          this.getDialKeysBlock();
          this.trigger('list:appended');

          this.ready = true;

          this.widget.add_action('phone', _.bind(function (data) {
            this.c2c_action(data);
          }, this));

          if (this._list_paused) {
            this.stopCallCounter();//Если остановлен, запускаем
          }

          var $container = $('#voximplantcontainer');
          if ($container.length > 0) {
            $container.css({top: '-200px'});
            $container.find('div').hide();
          }

          this.refresh_notification_counter();
          if (cookie.get(this.widget.params.widget_code + '_list_expanded')) {
            this.$el.find('#vox_imp__call_list_btn').addClass('list_opened');
          }
        });
        this.on('list:rewrite_awaiting_time', _.bind(function (time) {
          time = time[0];
          if (time > 0) {
            time = time.toString();
            this.$el.find('.amo__vox__implant_call__status__talk__time').html(time + this.widget.i18n('caller').time_measure);
          }
        }, this));
        this.on('list:call:start', this.listCallStart);
        this.on('list:change_call_status', this.listChangeCallStatus);
        this.on('list:clear:interval', this.listClearInterval);
        this.on('call:result:edit', this.callResultEdit);

        this.on('call:result:fail', this.callResultFail);

        this.$el.on('call:connected', _.bind(function () {
          this._now_calling.open_result = true;
        }, this)).on('call:disconnected', _.bind(function (e, not_show_result, only_result_edit) {
          console.log('call:disconnected triggered');
          console.log('arguments = ', arguments);
          if (this.is_parent_widget) {
            localStorage.setItem(
              this.widget.params.widget_code + '_call_disconnected',
              JSON.stringify({time: (+new Date()), data: {}})
            );

            if (!not_show_result) {
              if ((this._now_calling.open_result === true && this._call_time > 30 * 1000) || only_result_edit) {
                this.trigger('call:result:edit');
              } else {
                this.trigger('call:result:fail');
              }
            }
            $(document).trigger('list:cookies:update');
          }
          this._now_calling = false;
          if (this.calls && this.calls.length <= 0) {
            this.$el.hide();
          }
          this.clearDial();

          clearInterval(this._call_interval);

          this.trigger('list:change_call_status', [false]);
          console.log("this.$el.find('.amo__vox__implant_call__status__talk__time') = ", this.$el.find('.amo__vox__implant_call__status__talk__time'));
          this.$el.find('.amo__vox__implant_call__status__talk__time').html('');
          this.$el.find('.amo__vox__implant_call__status__contact').html('');
        }, this));

        $(document)
          .on('vox__login' + this.widget.ns, _.bind(function (e, login) {
            var params = this.widget.params,
              password = params.conf.password;

            if (login) {
              login = login + '@' + params.conf.application_name;
              this._voxImplant.login(login, password);
            }
          }, this))
          .on('list:cookies:update', +this.widget.ns, _.bind(function () {
            console.log('list:cookies:update');
            console.log('arguments = ', arguments);
            var calls = _.map(this.calls.models, function (call) {
              return call.attributes;
            });
            cookie.set({
              name: this.widget.params.widget_code + '_list',
              value: calls
            });
          }, this))
          .on('click', '.js-vox-payment-link', _.bind(function () {
            new AuthForm({
              'email': this.widget.params.conf.email,
              'api_key': this.widget.params.conf.api_key
            });
          }, this));

        var timeout = setTimeout(_.bind(function () {
          this.checkInitVox();
          clearTimeout(timeout);
        }, this), off_time);

        this.init_vox = true;

        new StorageMGMT({
          widget: this.widget,
          change: _.bind(function (e) {
            console.log('StorageMGMT change, arguments = ', arguments);
            var newValue = e.originalEvent.newValue,
              phone;

            switch (e.originalEvent.key) {
              case this.widget.params.widget_code + '_inited':
                this.init_vox = false;
                break;
              case this.widget.params.widget_code + '_change_call_status':
                newValue = JSON.parse(newValue) || {};
                if (newValue.data && !this.is_parent_widget) {
                  if (newValue.data[2] && newValue.data[3]) {
                    var element_info = newValue.data[3];
                    phone = newValue.data[2];

                    this._call_time = 0;
                    this.widget.getTemplate(
                      'call_status',
                      {},
                      _.bind(function (template, base_params) {
                        this.$el.find('.amo__vox__implant_call__status__contact').html(template.render(_.extend(base_params, {
                          lang: this.lang,
                          phone: phone,
                          element: element_info.element
                        })));
                        this.listChangeCallStatus(newValue.data);
                      }, this));
                  }
                }
                break;
              case this.widget.params.widget_code + '_show_message_error':
                newValue = JSON.parse(e.originalEvent.newValue) || {};
                this.widget.notifers.show_message_error(newValue.data, 1);
                break;
              case this.widget.params.widget_code + '_call_disconnected':
                this.$el.trigger('call:disconnected', [true]);
                this.$el.find('.amo__vox__implant_call__status__talk__time').html('');
                break;
              case this.widget.params.widget_code + '_incoming_call':
                newValue = JSON.parse(e.originalEvent.newValue) || {};
                phone = newValue.phone || false;
                if (phone) {
                  this.GetIncomingCall({
                    phone: phone,
                    element: newValue.element || false,
                    call_from_storage: true
                  });
                }
                break;
              case this.widget.params.widget_code + '_c2c_action':
                if (this.is_parent_widget) {
                  newValue = JSON.parse(e.originalEvent.newValue) || {};
                  this.c2c_action(newValue.data);
                }
                break;
              case this.widget.params.widget_code + '_hangUpPhone':
                if (this.is_parent_widget) {
                  newValue = JSON.parse(e.originalEvent.newValue) || {};
                  this.hangUpPhone();
                }
                break;
              case this.widget.params.widget_code + '_dial_start_call':
                if (this.is_parent_widget) {
                  newValue = JSON.parse(e.originalEvent.newValue) || {};
                  this.startCall(newValue.data);
                }
                break;
              case this.widget.params.widget_code + '_mic_mute':
                if (this.is_parent_widget) {
                  this.micMute();
                }
                break;
              case this.widget.params.widget_code + '_toPreTransfer':
                if (this.is_parent_widget) {
                  this.toPreTransfer();
                }
                break;
              case this.widget.params.widget_code + '_toInnerTransfer':
                if (this.is_parent_widget) {
                  newValue = JSON.parse(e.originalEvent.newValue) || {};
                  this.toInnerTransfer(newValue.number);
                }
                break;
              case this.widget.params.widget_code + '_acceptTransfer':
                if (this.is_parent_widget) {
                  this.acceptTransfer();
                }
                break;
              case this.widget.params.widget_code + '_backToCall':
                if (this.is_parent_widget) {
                  this.backToCall();
                }
                break;
              case this.widget.params.widget_code + '_incoming_call_answer':
              case this.widget.params.widget_code + '_incoming_call_answerAndOpen':
              case this.widget.params.widget_code + '_incoming_call_hangup':
                var incoming_function = e.originalEvent.key.split('_');

                incoming_function = incoming_function[incoming_function.length - 1];
                this.__IncomingCall = this.__IncomingCall || false;
                if (this.__IncomingCall && typeof this.__IncomingCall == 'object') {
                  if (!this.__IncomingCall.call_from_storage && typeof this.__IncomingCall[incoming_function] == 'function') {
                    this.__IncomingCall[incoming_function]();
                  }
                }
                break;
              case this.widget.params.widget_code + '_callResultEdit':
                if (!Visibility.hidden()) {
                  newValue = JSON.parse(e.originalEvent.newValue) || {};

                  var params = newValue.data;

                  params.widget = this.widget;
                  this.CallResult = new this._CallResult(params);
                }
                break;
              case this.widget.params.widget_code + '_IncomingCall_destroy':
                if (!this.is_parent_widget) {
                  if (this.__IncomingCall && typeof this.__IncomingCall.destroy == 'function') {
                    this.__IncomingCall.destroy();
                  } else {
                    $('#call_popup_notify').remove();
                  }
                }
                break;
              case this.widget.params.widget_code + '_listCallStart':
                if (this.is_parent_widget) {
                  newValue = JSON.parse(e.originalEvent.newValue) || {};
                  this.listCallStart(newValue.data);
                }
                break;
            }
          }, this)
        });

        this.payments = {
          get_balance: _.bind(function () {
            this.widget.tools.request({
              api_key: this.widget.params.conf.api_key,
              account_id: this.widget.params.conf.account_id
            }, 'balance', function (res) {
              console.log('balance arguments = ', arguments);
            });
          }, this),
          show_pay_message: _.bind(function () {
            var rights = AMOCRM.constant('user_rights') || {};
            if (rights.is_admin) {
              this.widget.notifers.show_message({
                id: 0,
                type: 'payment',
                text: this.lang.payment_text,
                date: Math.ceil(+new Date() / 1000),
                timeout: 10000,
                button_text: this.widget.i18n('settings').pay,
                link: '#',
                link_class: 'js-vox-payment-link'
              });
            } else {
              this.widget.notifers.show_message_error({
                text: this.lang.payment_text,
                without_header: true
              });
            }
          }, this)
        };
      },

      checkInitVox: function () {
        if (this.init_vox) {
          this.initVoxImplant();
        } else {
          this.is_parent_widget = false;
          console.log('Already in another window');
          this.trigger('vox:auth:success');
        }

        if (this.calls.length <= 0) {
          this.$el.addClass('empty_calls_list');
        }
      },

      c2c_action: function (data) {
        var _this = this;
        if (_this._list_current_call) {
          _this.clear_current_call();
        }
        if (!_this._now_calling) {
          var phone = data.value,
            element_info = {},
            entity = AMOCRM.getWidgetsArea().split('_');

          if (!data.element_info) {
            if (entity[1] == 'card') {
              entity = entity[0];
              if (data.model) {
                element_info.id = data.model.get('ID');
                element_info.element_type = data.model.get('ELEMENT_TYPE');
                element_info.entity = (element_info.element_type == 1) ? 'contact' : 'company';
                element_info.element = {
                  text: data.model.get('contact[NAME]'),
                  url: data.model.url
                };
                if (data.model.get('company[ID]') && data.model.get('company[ID]').length > 0) {
                  element_info.company = {
                    name: data.model.get('company[NAME]'),
                    url: '/companies/detail/' + data.model.get('company[ID]')
                  }
                }
              } else {
                var $card = AMOCRM.data.current_card.$el,
                  linked_collection = AMOCRM.data.current_card.linked_forms.form_models,
                  models = linked_collection.where({'ELEMENT_TYPE': AMOCRM.element_types.companies.toString()}),
                  company = models[0];

                element_info.id = AMOCRM.data.current_card.id;
                element_info.element_type = AMOCRM.data.current_card.element_type;
                element_info.entity = (element_info.element_type == 1) ? 'contact' : 'company';
                element_info.element = {
                  text: $card.find('#person_name').val(),
                  url: window.location.pathname
                };
                if (typeof company == 'object' && typeof company.get('ID') != 'undefined' && company.get('ID').length > 0) {
                  element_info.company = {
                    name: company.get('contact[NAME]'),
                    url: company.url
                  }
                }
              }
            } else if (data.model) {
              element_info.id = data.model.get('id');
              element_info.type = data.model.get('element_type');
              element_info.entity = data.model.get('entity');
              element_info.element = data.model.get('name');
              if (element_info.type != 3) {
                element_info.company = data.model.get('company_name');
              }
            }
            element_info.element = element_info.element || {};
          } else {
            element_info = data.element_info;
          }

          _this._list_current_call = false;

          if (!_this.is_parent_widget) {
            localStorage.setItem(
              _this.widget.params.widget_code + '_c2c_action',
              JSON.stringify({
                time: (+new Date()),
                data: {
                  element_info: element_info,
                  value: phone,
                  from_slave: true
                }
              })
            );
          } else {
            _this.widget.getTemplate(
              'call_status',
              {},
              function (template, base_params) {
                _this.$el.find('.amo__vox__implant_call__status__contact').html(template.render(_.extend(base_params, {
                  lang: _this.lang,
                  phone: phone,
                  element: element_info.element
                })));
                _this.doPreCallOperation(data.value, element_info);
              }
            );
          }
        } else {
          console.log('Call already exist');
        }
      },

      sync_current_call: function (calling_info) {
        console.log('sync_current_call called! arguments = ', arguments);
        var _this = this;
        if (typeof calling_info == 'string') {
          calling_info = JSON.parse(calling_info) || false;
        }

        if (!_this.is_parent_widget) {
          console.log('typeof calling_info = ', typeof calling_info);
          if (typeof calling_info == "object") {
            _this._now_calling = calling_info;
            _this.widget.getTemplate(
              'call_status',
              {},
              function (template, base_params) {
                _this.$el.find('.amo__vox__implant_call__status__contact').html(template.render(_.extend(base_params, {
                  lang: _this.lang,
                  call_type: 11,
                  phone: _this._now_calling.phone,
                  element: _this._now_calling.element_info.element
                })));
                _this.trigger('list:change_call_status', [true, 'outcomming']);
                //_this.start_calling_interval(parseInt(_this._now_calling.call_time));
              }
            );
          } else {
            _this.trigger('call:hangup');
            _this.trigger('list:change_call_status', [false]);
            _this.$el.trigger('call:disconnected', [true]);
          }
        }
      },

      events: {
        'click #vox_imp__call_list_btn': "openCallList",
        'click #clear_call_list': "removeAllCalls",
        'click .js-vox-icon-remove': "removeCall",
        'click .amo__vox__implant_call__status__queue_pause': "stopCallCounter",
        'click .amo__vox__implant_call__status__talk__rec': "recordCall",
        'click .amo__vox__implant_call__skip_btn': "skipCall",
        'click .amo__vox__implant_call__mute_mic_btn': "micMute",
        'click #vox_imp__dial_btn': "openDialWindow",
        'click .js-hungup_call': "hangUpPhone",
        'click #vox_imp__dial_wrapper.js-dial-action    .amo__vox__implant_call__dial_keyboard__item': "dialKeyPress",
        'click #vox_imp__dial_wrapper.js-forward-action .amo__vox__implant_call__dial_keyboard__item': "forwardKeyPress",
        'click .call_list_switcher': "openContactToggle",
        'click .js-backspace': "backspaceDial",
        'click #js-fail-recall': "recall",
        'click #vox_imp__transfer_btn': 'toPreTransfer',
        'click #vox_imp__standby_btn': 'backToCall',
        'click #vox_imp__transfer__dial_btn': 'toInnerTransfer',
        'click #vox_imp__transfer__dial_accept_btn': 'acceptTransfer',
        'click .amo__vox__implant_call': 'setFocusOnInput',
        'keyup .amo__vox__implant_call__dial_display__phone:focus': 'startCall'
      },

      setFocusOnInput: function (e) {
        console.log('setFocusOnInput, arguments = ', arguments);
        var $dial = this.$el.find('#vox_imp__dial_wrapper');
        if ($dial.hasClass('expanded')) {
          $dial.find('.amo__vox__implant_call__dial_display__phone').focus();
        }
      },

      startCall: function (e) {
        var _this = this,
          phone = e.phone || this.$el.find('.amo__vox__implant_call__dial_display__phone').val();

        if (!this._now_calling) {
          if (phone && e.keyCode == 13) {
            if (!_this.is_parent_widget) {
              localStorage.setItem(
                _this.widget.params.widget_code + '_dial_start_call',
                JSON.stringify({
                  time: (+new Date()), data: {
                    keyCode: e.keyCode,
                    phone: phone
                  }
                })
              );
            } else {
              _this.$el.find('.amo__vox__implant_call__status__talk__time').html('');
              _this.$el.find('.amo__vox__implant_call__status__contact').html('');
              _this.$el.find('#call_element_' + _this._list_current_call.cid).show();
              _this._list_current_call = false;
              if (!_this._list_paused) {
                _this.stopCallCounter();
              }
              this.widget.getTemplate(
                'call_status',
                {},
                function (template, base_params) {
                  _this.$el.find('.amo__vox__implant_call__status__contact').html(template.render(_.extend(base_params, {
                    lang: _this.lang,
                    phone: phone,
                    element: {}
                  })));
                  _this.doPreCallOperation(phone, {});
                }
              );
            }
            this.$el.find('.amo__vox__implant_call__dial_display__phone').val('');
          }
        }
      },

      doPreCallOperation: function (phone, element_info) {
        var _this = this,
          extension;
        phone = phone.toString() || '';
        _this._dialed_phone = phone;
        [';', '#', _this.lang.extention].forEach(function (value, key) {
          var res = phone.split(value);
          if (res.length >= 2) {
            phone = res[0].replace(/[^+\d]/g, '');
            extension = res[1].replace(/[^+\d]/g, '');
            _this.makeCall(phone, extension, element_info);
          } else if (key == 2) {
            phone = phone.replace(/[^+\d]/g, '');
            _this.makeCall(phone, '', element_info);
          }
        });
      },

      callEnded: function () {
        this._list_current_call = false;
        this.$el.find('.amo__vox__implant_call__status').removeClass('have_call');
      },

      clear_current_call: function () {
        this.calls.remove(this._list_current_call, ['silent']);
        this.calls.unshift(this._list_current_call, ['silent']);
        if (!this._list_paused) {
          this.stopCallCounter();
        }
      },

      makeCall: function (phone, extension, element_info) {
        if (!this._now_calling) {
          this._call_time = 0;
          phone = phone || false;
          if (phone) {
            if (this.$el.find('#vox_imp__call_list_wrapper').hasClass('expanded')) {
              this.openCallList();
            }
            if (this.$el.find('#vox_imp__dial_wrapper').hasClass('expanded')) {
              this.openDialWindow();
            }
            var callerid_id = this.widget.params.conf.callerid_id || {};
            callerid_id = callerid_id.all || '';
            var call = this._voxImplant.call('000' + phone, false, JSON.stringify({
              custom_sip: this.sip_params,
              callerid_id: callerid_id.toString()
            }));
            this.widget.calls_committed = true;
            this.call_record = this.call_record || {};
            this.call_record.note_type = 11;
            this.call_record.to = phone;
            this._now_calling = call;
            this._now_calling.phone = phone;
            this._now_calling.element_info = element_info;
            this.bindCallEventsListener(call, extension);
            this.trigger('list:change_call_status', [true, 'outcomming', phone, element_info]);
          } else {
            console.log('invalid phone');
          }
        }
      },

      toPreTransfer: function () {
        if (typeof this._now_calling == 'object' || !this.is_parent_widget) {
          if (typeof this._now_calling == 'object') {
            this._voxImplant.setCallActive(this._now_calling, false);
          }
          this.$el.find('#vox_imp__dial_wrapper')
            .addClass('pre_transfer');
          this.clearDial();

          if (!this.is_parent_widget) {
            localStorage.setItem(
              this.widget.params.widget_code + '_toPreTransfer',
              JSON.stringify({
                time: (+new Date())
              })
            );
          }
        } else {
          this.widget.notifers.show_message_error({
            text: this.lang.empty_active_call,
            without_header: true
          });
        }
      },

      backToCall: function () {
        if (this.is_parent_widget) {
          if (typeof this._now_calling == 'object') {
            if (typeof this.forwarding_call == 'object') {
              this._voxImplant.setCallActive(this.forwarding_call, false);
            }
            this._voxImplant.setCallActive(this._now_calling, true);
          } else {
            this.widget.notifers.show_message_error({
              text: this.lang.empty_active_call,
              without_header: true
            });
          }
        } else {

          localStorage.setItem(
            this.widget.params.widget_code + '_backToCall',
            JSON.stringify({
              time: (+new Date())
            })
          );
        }
        this.$el.find('#vox_imp__dial_wrapper')
          .removeClass('js-transfer-action')
          .removeClass('pre_transfer')
          .removeClass('inner_transfer')
          .addClass('js-dial-action');
        this.clearDial();
      },

      toInnerTransfer: function (number) {
        var _this = this;
        if (typeof number == "object") {
          number = this.$el.find('.amo__vox__implant_call__dial_display__phone').val();
        }
        number = number.replace(/[^\d]/g, '');
        if (this.is_parent_widget) {
          if (this._now_calling && number.length > 0) {
            this.forwarding_call = this._voxImplant.call('000' + number, false, JSON.stringify({custom_sip: this.sip_params}));
            this._voxImplant.setCallActive(this.forwarding_call, true);
            this.forwarding_call.addEventListener(VoxImplant.CallEvents.Failed, function (e) {
              _this.widget.notifers.show_message_error({
                text: JSON.stringify(e),
                without_header: true
              });
            });
            this.forwarding_call.addEventListener(VoxImplant.CallEvents.Disconnected, function (e) {
              if (!_this.transfer_complete) {
                _this.widget.notifers.show_message_error({
                  text: _this.lang.transfer_error,
                  without_header: true
                });
                _this._voxImplant.setCallActive(_this.forwarding_call, false);
                _this._voxImplant.setCallActive(_this._now_calling, true);
                _this.transfer_complete = false;
              }
            });

            this.$el.find('#vox_imp__dial_wrapper')
              .removeClass('pre_transfer')
              .addClass('inner_transfer')
              .addClass('js-transfer-action')
              .removeClass('js-dial-action');
          } else {
            this.widget.notifers.show_message_error({
              text: this.lang.wrong_number,
              without_header: true
            });
          }
        } else {
          this.$el.find('#vox_imp__dial_wrapper')
            .removeClass('pre_transfer')
            .addClass('inner_transfer')
            .addClass('js-transfer-action')
            .removeClass('js-dial-action');
          localStorage.setItem(
            _this.widget.params.widget_code + '_toInnerTransfer',
            JSON.stringify({
              time: (+new Date()),
              number: number
            })
          );
        }
      },

      acceptTransfer: function () {
        if (this.is_parent_widget) {
          if (typeof this._now_calling == 'object' && typeof this.forwarding_call == 'object') {
            this._voxImplant.transferCall(this._now_calling, this.forwarding_call);
          }
        } else {
          localStorage.setItem(
            this.widget.params.widget_code + '_acceptTransfer',
            JSON.stringify({
              time: (+new Date()),
              data: {}
            })
          )
        }
        this.$el.find('#vox_imp__dial_wrapper')
          .removeClass('inner_transfer')
          .removeClass('js-transfer-action')
          .addClass('js-dial-action');
        this.clearDial();
      },

      start_calling_interval: function (time) {
        var _this = this;

        clearInterval(this._call_interval);
        if (typeof time == 'number') {
          _this._call_time = time;
        }
        if (typeof _this._call_time == 'undefined') {
          _this._call_time = 0;
        }
        this._call_interval = setInterval(function () {
          var text = moment(_this._call_time).format('mm:ss');
          _this.$el.find('.amo__vox__implant_call__status__talk__time').html(text);
          _this._call_time += 1000;
        }, 1000);
      },

      skipCall: function () {
        this.$el.find('.amo__vox__implant_call__status__talk__time').text('');
        if (this._list_current_call) {
          this.calls.push(this._list_current_call);
          this.$el.find('#call_element_' + this._list_current_call.cid).remove();
          this.bindViews(this._list_current_call, false);
          this.startSort();
          this.callEnded();
          this.checkListState();
        }
      },

      openContactToggle: function () {
        this._call_open_contact = !this._call_open_contact;
        cookie.set({
          name: this.widget.params.widget_code + '_open_contact',
          value: this._call_open_contact ? 1 : 0
        });
      },

      refresh_notification_counter: function () {
        var calls_count = this.calls.length,
          $counter = $(document).find('.nav__notifications-call-list .js-notifications_call_list_counter');

        if (calls_count <= 0) {
          $counter.hide();
        } else {
          calls_count = calls_count.toString();
          $counter.html(calls_count);
          $counter.show();
        }
      },

      checkListState: function () {
        this.refresh_notification_counter();
        if (!this._now_calling) {
          if (this.calls.length > 0) {
            this.$el.show();
            this.$el.removeClass('empty_calls_list');
            if (!this._list_current_call) {
              this.listCallGetNext();
            }
          } else {
            this.$el.hide();
            this.$el.addClass('empty_calls_list');
          }
        }
      },

      listPlay: function () {
        var _this = this,
          awaiting_time = _this.widget.params.calls_timeout;

        if (!awaiting_time) {
          awaiting_time = 10;
        }
        if (this._list_interval) {
          clearInterval(this._list_interval);
        }
        this._list_interval = setInterval(function () {
          if (!_this._list_paused) {
            if (awaiting_time > 0) {
              _this.trigger('list:rewrite_awaiting_time', [awaiting_time]);
              awaiting_time--;
            } else {
              _this.trigger('list:clear:interval');
              _this.trigger('list:call:start');
            }
          }
        }, 1000);
      },

      callResultEdit: function () {
        console.log('this._now_calling = ', $.extend({}, this._now_calling));
        if (!Visibility.hidden()) {
          this.CallResult = new this._CallResult({
            widget: this.widget,
            element: $.extend({}, this._now_calling.element_info),
            call_info: $.extend({}, this._now_calling),
            call_record: this.call_record,
            call_time: this._call_time
          });
        } else if (this.is_parent_widget) {
          localStorage.setItem(
            this.widget.params.widget_code + '_callResultEdit',
            JSON.stringify({
              time: (+new Date()),
              data: {
                element: $.extend({}, this._now_calling.element_info),
                call_info: $.extend({}, this._now_calling),
                call_record: this.call_record,
                call_time: this._call_time
              }
            })
          );
        }

      },

      callResultFail: function () {
        new CallResultFail({
          widget: this.widget,
          element: $.extend({}, this._now_calling.element_info),
          call_info: $.extend({}, this._now_calling),
          call_record: this.call_record,
          call_time: this._call_time
        });
      },

      listClearInterval: function () {
        clearInterval(this._list_interval);
      },

      listCallStart: function (params) {
        params = params || {};
        var _this = this,
          phone = params.phone || false,
          attributes = params.attributes || false;

        if (!phone && !attributes) {
          phone = _this.$dial_block.find('.amo__vox__implant_call__dial_display__phone').val() || false;
          if (typeof this._list_current_call == 'object') {
            phone = this._list_current_call.get('phone');
            attributes = this._list_current_call.attributes || {};
          }
        }

        if (phone && _this.is_parent_widget) {
          phone = phone.toString();
          this.widget.getTemplate(
            'call_status',
            {},
            function (template, base_params) {
              _this.$el.find('.amo__vox__implant_call__status__contact').html(template.render(_.extend(base_params, {
                lang: _this.lang,
                phone: phone,
                element: attributes
              })));
              _this.doPreCallOperation(phone, attributes);
            }
          );
        } else if (!_this.is_parent_widget) {
          if (!attributes) {
            attributes = {};
          }
          localStorage.setItem(
            this.widget.params.widget_code + '_listCallStart',
            JSON.stringify({
              time: (+new Date()),
              data: {
                phone: phone,
                attributes: attributes
              }
            })
          );
        }
      },

      bindCallEventsListener: function (call, extension) {
        console.log('bindCallEventsListener arguments = ', arguments);
        extension = extension || '';

        var _this = this;
        if (typeof call.hangup == 'function' && typeof call.addEventListener == 'function') {
          _this.once('call:hangup', function () {
            _this._now_calling.hangup();
          });
          call.addEventListener(VoxImplant.CallEvents.MessageReceived, function (e) {
            console.log('Event VoxImplant.CallEvents.MessageReceived called! arguments = ', arguments);
            if (typeof e.text == 'string') {
              var data = JSON.parse(e.text) || {};
              if (data.type == 'record_url') {
                data.note_type = 11;
                _this.call_record = data;
              }
            }
          });

          call.addEventListener(VoxImplant.CallEvents.Connected, function (e) {
            console.log('Event VoxImplant.CallEvents.Connected called! arguments = ', arguments);
            _this.$el.trigger('call:connected');
            if (extension.length > 0) {
              extension = extension.split('');

              setTimeout(function () {
                extension.forEach(function (dialkey) {
                  call.sendTone(dialkey);
                });
              }, 1000);
            }
            if (_this.$el.find('#vox_imp__rec_call').hasClass('rec_is_on')) {
              call.sendMessage('start_recording');
            }
          });

          call.addEventListener(VoxImplant.CallEvents.TransferComplete, function (e) {
            console.log('Event VoxImplant.CallEvents.TransferComplete called! arguments = ', arguments);
            _this.transfer_complete = true;
          });

          call.addEventListener(VoxImplant.CallEvents.TransferFailed, function (e) {
            console.log('Event VoxImplant.CallEvents.TransferFailed called! arguments = ', arguments);
          });

          call.addEventListener(VoxImplant.CallEvents.Disconnected, function (e) {
            console.log('Event VoxImplant.CallEvents.Disconnected called! arguments = ', arguments);
            _this.$el.trigger('call:disconnected');
            if (_this.$el.is(":visible")) {
              $('body').addClass('vox_panel');
            } else {
              $('body').removeClass('vox_panel');
            }
          });

          call.addEventListener(VoxImplant.CallEvents.Failed, function (e) {
            console.log('Event VoxImplant.CallEvents.Failed called! arguments = ', arguments);
            var not_show_result = false;
            if (e.name == 'Failed') {
              not_show_result = true;
              if (e.code == 402) {
                _this.payments.show_pay_message();
              } else {
                var text = _this.lang['error_' + e.code] || _this.lang.error_unknown;
                _this.widget.notifers.show_message_error({
                  text: text,
                  without_header: true
                });
              }
              if (_this.calls.length <= 0) {
                _this.$el.hide();
              }
            }
            _this.$el.trigger('call:disconnected', [not_show_result]);
          });

          if (_this._call_open_contact && _this._list_current_call) {
            var url = _this._list_current_call.get('element')['url'];
            if (url) {
              router.navigate(url, {trigger: true});
            } else {
              console.log('empty element url');
            }
          }
        } else {
          console.log('call must be OBJECT. FATAL');
        }
      },

      listChangeCallStatus: function (data) {
        var call_start = data[0] || false,
          incoming = (data[1] == 'incomming'),
          method = 'removeClass';
        if (call_start) {
          this.$el.show();
          if (this.$el.is(":visible")) {
            $('body').addClass('vox_panel');
          } else {
            $('body').removeClass('vox_panel');
          }
          this.$el.find('.amo__vox__implant_call__dial_display__phone').intlTelInput("destroy");
          method = 'addClass';
          this.$el.find('.amo__vox__implant_call__status__talk__time').html('').show();
          var call_lang = (incoming) ? this.lang.incomming : this.lang.outcomming;
          this.$el.find('.amo__vox__implant_call__status__contact__call_type').text(call_lang);

          this.start_calling_interval();
          if (!this.is_parent_widget) {
            this._now_calling = true;
          }
        } else {
          var ip_info = AMOCRM.constant('ip_info'),
            params = {
              utilsScript: "/frontend/js/vendor/intl-tel-input/lib/libphonenumber/build/utils.js"
            };

          if (ip_info) {
            params.defaultCountry = ip_info.country_code.toLowerCase();
          }
          this.$el.find('.amo__vox__implant_call__dial_display__phone').intlTelInput(
            params
          );
          this.$el.find('.amo__vox__implant_call__status__contact__call_type').text(this.lang.next_call);

          if (!this.is_parent_widget) {
            this._now_calling = false;
          }
        }
        console.log('status (this.is_parent_widget) = ', this.is_parent_widget);
        if (this.is_parent_widget) {
          localStorage.setItem(
            this.widget.params.widget_code + '_change_call_status',
            JSON.stringify({
              time: (+new Date()),
              data: data
            })
          );
        } else {
          $(document).find('#call_popup_notify').remove();
        }
        this.$el[method]('outgoing_call');
      },

      listCallGetNext: function () {
        var model = this.calls.last() || {},
          _this = this,
          params = model.attributes || false;

        if (!params) {
          return;
        }

        this._list_current_call = model;
        this.$el.find('.amo__vox__implant_call__status').addClass('have_call');

        params.lang = this.lang;
        _this.widget.getTemplate(
          'call_status',
          {},
          function (template, base_params) {
            _this.$el.find('#call_element_' + model.cid).hide();
            _this.$el.find('.amo__vox__implant_call__status__contact').html(template.render(_.extend(base_params, params)));
          }
        );

        this.$el.find('#call_element_' + model.cid).hide();
        this.trigger('list:play');
      },

      startSort: function () {
        var _this = this;
        _.map(_this.calls.models, function (call) {
          var sort = _this.$el.find('#call_element_' + call.cid).index();
          call.set({'sort': sort});
          return call.attributes;
        });
        _this.calls.sort();
        $(document).trigger('list:cookies:update');
      },

      _save: function (call) {
        call.save();
      },

      addCall: function (data) {
        var _this = this;
        if (_this.calls.where({'element_id': data.element_id}).length <= 0) {
          var model = _this.calls.max(function (call) {
              return call.get('sort');
            }) || {};
          if (-Infinity != model) {
            data.sort = model.get('sort') + 1;
          } else {
            data.sort = 1;
          }
          _this.calls.add([data]);
          this.modifyCompactList();
        } else {
          console.log('already in list');
        }

      },

      removeCall: function (e) {
        console.log('removeCall arguments = ', arguments);
        var id = $(e.target).data('id'),
          models = this.calls.where({element_id: id});
        console.log('id = ', id, 'models = ', models);
        if (models.length > 0) {
          models = models[0];
          this.calls.remove(models);
        }
        this.modifyCompactList();
      },

      removeAllCalls: function () {
        if (!this._now_calling) {
          this.$el.find('.amo__vox__implant_call__list_wrapper__list__task').remove();
          this.$el.find('.amo__vox__implant_call__status__contact').html('');
        }
        if (this.$el.find('#vox_imp__call_list_wrapper').hasClass('expanded')) {
          this.openCallList()
        }
        this.calls.reset();
        this.callEnded();
        this.startSort();
        if (!this._list_paused) {
          this.stopCallCounter();
        }
        this.checkListState();
      },

      initVoxImplant: function () {
        this._voxImplant = {};

        $.getScript(/* ссылка на ваш скрипт работы с телефонией */+'/your_script.min.js', _.bind(function () {
          this._voxImplant = VoxImplant.getInstance();
          this._voxImplant.writeLog = _.bind(function () {
            console.log('_voxImplant.writeLog function called, arguments = ', arguments);
          }, this);
          this._voxImplant.writeTrace = _.bind(function () {
            if (arguments[0]) {
              if (arguments[0] === 'Called local function __pong with params []') {
                return;
              } else if (arguments[0] === 'Called remote function __ping with params []') {
                return;
              }
            }
            console.log('_voxImplant.writeTrace function called, arguments = ', arguments);
          }, this);
          this._voxImplant.addEventListener(VoxImplant.Events.MicAccessResult, _.bind(function (e) {
            console.log('voxImplant event: VoxImplant.Events.MicAccessResult, arguments = ', arguments);
            var result = e.result || false,
              $container = $('#voximplantcontainer');

            if ($container.length > 0) {
              if (result) {
                $container.css({top: '-200px'});
                $container.find('div').hide();
              } else {
                $container.css({top: '0px'});
                $container.prepend('<div class="voximplant_flash_notify">' + this.lang.flash_notify + '</div>');
              }
            }
          }, this));
          this._voxImplant.addEventListener(VoxImplant.Events.SDKReady, _.bind(function () {
            console.log('voxImplant event: VoxImplant.Events.SDKReady, arguments = ', arguments);
            $('#voximplantcontainer').css('z-index', '1000');
            this._voxImplant.connect();
          }, this));
          this._voxImplant.addEventListener(VoxImplant.Events.ConnectionEstablished, _.bind(function () {
            console.log('voxImplant event: VoxImplant.Events.ConnectionEstablished, arguments = ', arguments);
            this.check_vox_user(AMOCRM.constant('user')['id']);
          }, this));
          this._voxImplant.addEventListener(VoxImplant.Events.AuthResult, _.bind(function (data) {
            console.log('voxImplant event: VoxImplant.Events.AuthResult, arguments = ', arguments);
            data = data || {};
            if (data.result) {
              this.is_parent_widget = true;
              console.log('setItem _inited');
              localStorage.setItem(this.widget.params.widget_code + '_inited', (+new Date()));
              setInterval(_.bind(function () {
                if (!this._voxImplant.connected()) {
                  this._voxImplant.connect();
                }

                localStorage.setItem(this.widget.params.widget_code + '_inited', (+new Date()));
              }, this), Math.round(off_time * 0.5));

              this.trigger('vox:auth:success');
            } else {
              this.widget.notifers.show_message_error({
                text: JSON.stringify(r)
              });
            }
          }, this));
          this._voxImplant.addEventListener(VoxImplant.Events.ConnectionClosed, _.bind(function () {
            console.log('voxImplant event: VoxImplant.Events.ConnectionClosed, arguments = ', arguments);
            this._voxImplant.connect();
          }, this));
          this._voxImplant.addEventListener(VoxImplant.Events.ConnectionFailed, _.bind(function () {
            console.log('voxImplant event: VoxImplant.Events.ConnectionFailed, arguments = ', arguments);
          }, this));
          this._voxImplant.addEventListener(VoxImplant.Events.IncomingCall, _.bind(function (e) {
            console.log('voxImplant event: VoxImplant.Events.IncomingCall, arguments = ', arguments);
            if (this.$el.is(":visible")) {
              $('body').addClass('vox_panel');
            } else {
              $('body').removeClass('vox_panel');
            }
            this.GetIncomingCall(e);
          }, this));
          this._voxImplant.init({
            showFlashSettings: true,
            showDebugInfo: true
          });
        }, this));
      },

      GetIncomingCall: function (e) {
        var call;
        console.log('GetIncomingCall, arguments = ', arguments, 'this._now_calling = ', this._now_calling);
        if (!this._now_calling) {
          console.log('e.call_from_storage = ', e.call_from_storage);
          if (!e.call_from_storage) {
            call = this._now_calling = e.call;
          } else {
            call = {phone: e.phone};
          }
          this.$el.find('.amo__vox__implant_call__status__talk__time').html('');
          this.$el.find('.amo__vox__implant_call__status__contact').html('');
          this.$el.find('#call_element_' + this._list_current_call.cid).show();
          this._list_current_call = false;
          console.log('this._list_paused = ', this._list_paused);
          if (!this._list_paused) {
            this.stopCallCounter();
          }
          this.__IncomingCall = new IncomingCall({
            widget: this.widget,
            call: call,
            calls_list: this,
            element: e.element || false,
            call_from_storage: e.call_from_storage || false
          });
        }
      },

      check_vox_user: function (user_id) {
        var user_ext = this.widget.params.auth_data[user_id] || {};

        this.widget.tools.request({
            user_id: user_id,
            user_ext: user_ext,
            trial: (this.widget.params.trial == 'Y')
          },
          'check_user',
          _.bind(function (data) {
            if (typeof data == 'string') data = JSON.parse(data);
            data = data || {};
            if (data.login) {
              $(document).trigger('vox__login' + this.widget.ns, data.login);
            } else {
              this.widget.notifers.show_message_error({
                text: 'Gravitel: ошибка авторизации'
              });
            }
          }, this));
      },

      bindViews: function (call, append) {
        var $subview = new this._Call.View({
          model: call,
          widget: this.widget,
          id: call.get('id')
        });
        if (append) {
          this.$el.find('.amo__vox__implant_call__list_wrapper__list').append($subview.$el);
        } else {
          this.$el.find('.amo__vox__implant_call__list_wrapper__list').prepend($subview.$el);
        }

        if (!this.$el.find('#vox_imp__call_list_wrapper').hasClass('expanded')) {
          this.openCallList();
        }
      },

      openCallList: function () {
        var $list_wrapper = this.$el.find('#vox_imp__call_list_wrapper').toggleClass('expanded'),
          state = 0;
        if ($list_wrapper.hasClass('expanded')) {
          this.$el.find('#vox_imp__call_list_btn').addClass('list_opened');
          state = 1;
        } else {
          this.$el.find('#vox_imp__call_list_btn').removeClass('list_opened');
        }
        cookie.set({
          name: this.widget.params.widget_code + '_list_expanded',
          value: state
        });
        this.modifyCompactList();
      },

      modifyCompactList: function () {
        var $list_wrapper = this.$el.find('#vox_imp__call_list_wrapper'),
          $call_list = $('#sortable_calls_list');

        if ($list_wrapper.hasClass('expanded') && $list_wrapper.hasClass('compact')) {
          if ($call_list[0].scrollHeight > $call_list[0].offsetHeight) {
            $call_list.css('padding-right', Fn.scrollBarWidth + 'px');
          } else {
            $call_list.css('padding-right', '');
          }
        } else {
          return false;
        }
      },

      recordCall: function () {
        this.$el.find('#vox_imp__rec_call').toggleClass('rec_is_on');
      },

      stopCallCounter: function () {
        if (!this.ready) {
          return false;
        }
        var $icon = this.$el.find('#vox_imp__play_call').closest('#vox_implant__icon_wrapper');

        this._list_paused = !this._list_paused;

        if (this._list_paused) {
          if (!this._now_calling) {
            this.$el.find('.amo__vox__implant_call__status__talk__time').hide();
          }
          $icon.addClass('active');
        } else {
          this.$el.find('.amo__vox__implant_call__status__talk__time').show();
          $icon.removeClass('active');
          if (!this._list_current_call) {
            this.listCallGetNext();
          }
        }
      },

      micMute: function () {
        var $button = this.$el.find('#vox_imp__mic_btn');

        $button.toggleClass('mute_is_off');
        if (this.is_parent_widget) {
          if ($button.hasClass('mute_is_off')) {
            this._now_calling.muteMicrophone();
          } else {
            this._now_calling.unmuteMicrophone();
          }
        } else {
          localStorage.setItem(
            this.widget.params.widget_code + '_mic_mute',
            JSON.stringify({time: (+new Date())})
          );
        }
      },

      openDialWindow: function () {
        if (!this.$el.find('#vox_imp__dial_wrapper').hasClass('pre_transfer')) {
          this.$el.find('#vox_imp__dial_wrapper')
            .toggleClass('js-dial-action');
          this.$el.find('#vox_imp__call_list_wrapper').toggleClass('compact');
          this.modifyCompactList();
          this.clearDial();
        }
        this.$el.find('#vox_imp__dial_wrapper').toggleClass('expanded');
        this.$el.find('#vox_imp__dial_btn').toggleClass('dial_opened');
        this.$el.find('.amo__vox__implant_call__dial_display__phone').focus();
      },

      clearDial: function () {
        this.$dial_block.find('.amo__vox__implant_call__dial_display__phone').val('');
      },

      hangUpPhone: function () {
        if (this._now_calling) {
          if (!this.is_parent_widget) {
            localStorage.setItem(
              this.widget.params.widget_code + '_hangUpPhone',
              JSON.stringify({
                time: (+new Date()),
                data: {}
              })
            );
          } else {
            this.trigger('call:hangup');
          }
        } else {
          this.trigger('list:clear:interval');
          this.trigger('list:call:start');
        }
      },

      dialKeyPress: function (e) {
        var num = $(e.currentTarget).data('num'),
          $dial = this.$dial_block.find('.amo__vox__implant_call__dial_display__phone'),
          value;
        $dial.focus();
        setTimeout(function () {
          value = $dial.val();
          value = value + '' + num;
          $dial.val(value);
          if (this._now_calling) {
            this._now_calling.sendTone(num);
          } else {
            $dial.focus();
          }
        }, 5);
        return true;
      },

      forwardKeyPress: function (e) {
        var num = $(e.currentTarget).data('num'),
          value = this.$dial_block.find('.amo__vox__implant_call__dial_display__phone').val() || '';

        value = value + '' + num;
        this.$dial_block.find('.amo__vox__implant_call__dial_display__phone').val(value);
      },

      backspaceDial: function () {
        var $el = this.$el.find('#vox_imp__dial_wrapper .amo__vox__implant_call__dial_display__phone'),
          display_phone = $el.val().toString();
        if (display_phone.length > 0) {
          display_phone = display_phone.substr(0, display_phone.length - 1);
          $el.focus();
          $el.val(display_phone);
        }
      },

      render: function (calls) {
        var _this = this;
        _this.widget.getTemplate(
          'call_list',
          {},
          function (template, base_params) {
            _this.$el.html(template.render(_.extend(base_params, {
              list_expanded: 0/*!(cookie.get(_this.widget.params.widget_code + '_list_expanded') == '0')*/,
              open_contact: !(cookie.get(_this.widget.params.widget_code + '_open_contact') == '0'),
              lang: _this.lang
            })));
            _this.$el.find('#sortable_calls_list').sortable({//сортировка звонков
              items: 'div.amo__vox__implant_call__list_wrapper__list__task',
              handle: '.icon-sortable',
              axis: 'y',
              containment: '#vox_imp__call_list_wrapper .amo__vox__implant_call__list_wrapper__list',
              scroll: false,
              tolerance: 'pointer',
              stop: function () {
                _this.startSort();
              }
            });
            calls = calls || [];
            if (calls.length > 0) {
              _this.calls.push(calls);
            }
          }
        );
        return this;
      },

      recall: function () {
      },

      getDialKeysBlock: function () {
        var dial_keys = [
            {num: '1', text: '', id: 'dial_key_one'},
            {num: '2', text: 'abc', id: 'dial_key_two'},
            {num: '3', text: 'def', id: 'dial_key_three'},
            {num: '4', text: 'ghi', id: 'dial_key_four'},
            {num: '5', text: 'jkl', id: 'dial_key_five'},
            {num: '6', text: 'mno', id: 'dial_key_six'},
            {num: '7', text: 'pqrs', id: 'dial_key_seven'},
            {num: '8', text: 'tuv', id: 'dial_key_eight'},
            {num: '9', text: 'wxyz', id: 'dial_key_nine'},
            {num: '*', text: '', id: 'dial_key_asterisk'},
            {num: '0', text: '+', id: 'dial_key_zero'},
            {num: '#', text: '', id: 'dial_key_lattice'}
          ],
          _this = this;

        _this.widget.getTemplate(
          'dial_block',
          {},
          function (template, base_params) {
            console.log('getTemplate callback, arguments = ', arguments, '_this.$el = ', _this.$el);
            _this.$el.append(template.render(_.extend(base_params, {
              dial_keys: dial_keys,
              lang: _this.lang
            })));

            var ip_info = AMOCRM.constant('ip_info'),
              params = {
                utilsScript: "/frontend/js/vendor/intl-tel-input/lib/libphonenumber/build/utils.js"
              };

            if (ip_info) {
              params.defaultCountry = ip_info.country_code.toLowerCase();
            }
            _this.$el.find('.amo__vox__implant_call__dial_display__phone').intlTelInput(
              params
            );
            _this.$dial_block = $('#vox_imp__dial_wrapper');
          }
        );
      }
    })
  };

  return Calls;
});
