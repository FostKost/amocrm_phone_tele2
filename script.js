define([
  'jquery',
  'lib/common/cookie',
  'twigjs',
  'lib/components/base/modal',
  window.location.origin + '/widgets/amo__vox__implant/calls_list.js',
  window.location.origin + '/widgets/amo__vox__implant/call.js',
  window.location.origin + '/widgets/amo__vox__implant/call_result.js',
  window.location.origin + '/widgets/amo__vox__implant/auth_form.js'
], function ($, cookie, twig, Modal, Calls, Call, CallResult, AuthForm) {
  var CustomWidget = function () {
    var self = this,
      settings = {},
      body = $('body'),
      GETparams = window.location.search,
      acc_tok = GETparams.match("code=([A-Za-z0-9]+)"),
      code = acc_tok ? acc_tok[1] : false,
      loader = '';

    self.calls_committed = false;

    //notifications and errors
        self.notifers = {};
        self.clickSaveButton = function() {
          var $save_button = $(document).find('.js-widget-save');
			$save_button.removeAttr('data-loading');
			$save_button.click();
        };        
        self.notifers.show_message = function(params) {
            AMOCRM.notifications.show_message(params);
        };
        self.notifers.show_message_error = function(obj, from_storage) {
            AMOCRM.notifications.show_message_error(obj);
            if(!from_storage) {
                if(self.__CallsList && self.__CallsList.is_parent_widget) {
                    localStorage.setItem(
                        self.params.widget_code + '_show_message_error',
                        JSON.stringify({
                            time:(+new Date()),
                            data:obj
                        })
                    );
                }
            }
        };
    self.addError = function ($el, error) {
      error = error || '';
      if (typeof error == 'object') {
        error = JSON.stringify(error);
      }
      $el.text(error);
    };

    self.tools = {
      request: function (params, method, func) {
        var system = self.system(),
          real_http = '//' + system.domain + '/widgets/' + system.subdomain + '/loader/' + self.params.widget_code,
          auth_params = '?amouser=' + system.amouser + '&amohash=' + system.amohash;
        $.ajax({
          type: "POST",
          url: real_http + '/' + method + auth_params,
          data: params,
          success: func,
          dataType: 'json',
          error: function (msg) {
            self.notifers.show_message_error({
              text: JSON.stringify(msg),
              without_header: true
            });
          }
        });
      },
      widget_register: function (e) {
        self.tools.request({}, 'register_widget', function (res) {
          var error = res ? res.error : lang.no_response;

          if (error) {
            self.modal.$modal.find('.js-widget-save').trigger('button:save:error');
            self.addError($('.js-errors-block'), error);
            self.$modal.show();
          } else {
            self.registered = self.checked = true;
            self.new_conf = JSON.stringify(res);
            self.clickSaveButton();
          }
        });
      },
      check_sip: function (fields) {
        if (fields.custom_sip_line && fields.custom_sip_line.length > 0) {
          self.tools.request(fields, 'sip_reg', function (data) {
            if (data.status) {
              self.checked = true;
              self.clickSaveButton();
            }
          });
        } else {
          self.checked = true;
          self.clickSaveButton();
        }
      },
      set_caller_id: function (caller_id) {
        caller_id = caller_id || '';
        caller_id = caller_id.toString();
        caller_id = caller_id.replace(/[^+\d]/g, '');
        if (caller_id > 0) {
          self.params.conf.callerid_id = self._data.callerid_id = {};
          self.params.conf.callerid_id = (typeof self.params.conf.callerid_id == 'object') ? self.params.conf.callerid_id : {};
          self._data.callerid_id = (typeof self._data.callerid_id == 'object') ? self._data.callerid_id : {};

          self.params.conf.callerid_id.all = caller_id;
          self._data.callerid_id.all = caller_id;
        }
      }
    };

    self.getTemplate = function (template, params, callback) {
      params = (typeof params == 'object') ? params : {};
      template = template || '';

      return self.render({
        href: '/templates/' + template + '.twig',
        base_path: self.params.path,
        v: +new Date,
        load: _.bind(function(template) {
          if (callback && _.isFunction(callback)) {
            callback(template, {widget_code: self.params.widget_code});
          }
        }, this)
      }, params);
    };

    self._data = {};
    self.data = {
      get: function (key) {
        key = key || '';
        return self._data[key] || false;
      },
      set: function (key, value) {
        value = value || false;
        key = key || '';
        if (typeof key == 'object') {
          $.each(key, function (elem, value) {
            self.data.set(elem, value);
          });
        } else {
          key = key.toString();
          if (key.length > 0) {
            self._data[key] = value;
          }
        }
      }
    };

    this.callbacks = {
      settings: function ($modal) {
        var params = self.params;
        params.conf = params.conf || false;

        $('#widget_settings__fields_wrapper').hide();
        $modal.find('.js-widget-save').trigger('button:save:enable');
        self.$modal = $modal;

        if(!params.conf) {
          $('.js-vox_payment_iframe, .js-amo__vox__implant_bind_caller_id').hide();
          self.registered = false;
        } else {
          $('.widget_settings_block__descr').append('<br/><a href="#" id="' + self.params.widget_code + '_additional_settings">' + self.i18n('settings').additional + '</a>');
          self.checked = false;
        }
      },
      onSave: function (data) {
        data.fields.calls_timeout = data.fields.calls_timeout || 10;
        data.fields.calls_timeout = data.fields.calls_timeout.toString();
        data.fields.calls_timeout = data.fields.calls_timeout.replace(/[^\d]/g, '');
        data.fields.calls_timeout = parseInt(data.fields.calls_timeout) || 10;

        if(!self.registered) {
          console.log('widget_register');
          self.tools.widget_register(data);
        } else if(!self.checked) {
          console.log('checked sip');
          self.$modal.hide();
          self.tools.check_sip(data.fields);
        } else if(self.checked) {
          if(self.new_conf) {
            data.fields.conf = self.new_conf;
          } else if(typeof data.fields.conf == 'object') {
            data.fields.conf = JSON.stringify(data.fields.conf);
          }
          return true;
        }
        return false;
      },
      init: function () {
        console.log('is_touch_device = ', AMOCRM.is_touch_device);
        if (AMOCRM.is_touch_device) {
          return false;
        }

        self.params.selected_without_block = true;
        $('head').append('<link rel="stylesheet" href="' + self.params.path + '/styles.css?v=' + (+new Date) + '" type="text/css" />');

        var params = self.params,
          sip_params = {};

        params.conf = params.conf || false;
        if(params.conf) {
          self.registered = true;
        }

        console.log('params = ', params);

        if(typeof params.auth_data == 'string') {
          params.auth_data = JSON.parse(params.auth_data);
        }

        if(typeof params.custom_sip_line != 'string' || params.custom_sip_line.length <= 0 ) {
          params.custom_sip_line = false;
        } else {
          sip_params.domain = params.custom_sip_line;
        }
        if(typeof params.auth_data == 'object') {
          var user_id = AMOCRM.constant('user')['id'];
          if(self.params.auth_data[user_id]) {
            sip_params.user = self.params.auth_data[user_id].login;
            sip_params.password = self.params.auth_data[user_id].password;
          }
        }
        if (params.widget_active == 'Y') {
          var calls_list = cookie.get(self.params.widget_code + '_list');
          if(typeof calls_list == 'string') {
            calls_list = JSON.parse(calls_list);
          }
          sip_params.domain = sip_params.domain || '';
          if((sip_params.domain.length > 0 && sip_params.user.length > 0) ||
            (sip_params.domain.length <= 0 && sip_params.user.length <= 0)) {
            self.__CallsList = new Calls.View({
              calls   : calls_list,
              lang    : self.i18n('caller'),
              widget  : self,
              Call    : Call,
              CallResult : CallResult,
              sip_params : sip_params
            });
          }
        }

        console.log('sip_params = ', sip_params);
        return true;
      },
      render: function () {
        return !(AMOCRM.is_touch_device);
      },
      bind_actions: function () {
        if (AMOCRM.is_touch_device) {
          return false;
        }

        $(window).on('unload' + self.ns, function () {
          localStorage.removeItem(self.params.widget_code + '_current_call');
          if (self && self.__CallsList && self.__CallsList.is_parent_widget) {
            localStorage.removeItem(self.params.widget_code + '_inited');
            if (self.__CallsList._voxImplant && _.isFunction(self.__CallsList._voxImplant.disconnect)) {
              self.__CallsList._voxImplant.disconnect();
            }
          }
        });
        window.onbeforeunload = function () {
          if (self.__CallsList.is_parent_widget && self.calls_committed) {
            return self.i18n('caller').onbeforeunloadalert;
          }
        };

        $(document)
          .on(AMOCRM.click_event + self.ns, '#' + self.params.widget_code + '_additional_settings', function () {
            $('#widget_settings__fields_wrapper').toggle();
            self.$modal.trigger('modal:centrify');
          })
          .on(AMOCRM.click_event + self.ns, '#js-' + self.params.widget_code + '-auth', function (e) {
            e.preventDefault();
            $('#' + self.params.widget_code + '_login_block').slideToggle();
          })
          .on(AMOCRM.click_event + self.ns, '#js-' + self.params.widget_code + '-additional', function (e) {
            $('input[name=custom_sip_line], .widget_settings_block_users')
              .closest('.widget_settings_block__item_field').show();

          }).on('click' + self.ns, '.js-vox_payment_iframe', function(){
            self.params.conf = self.params.conf || {};
            if(self.params.conf.email && self.params.conf.api_key){

              new AuthForm({
                'email'     :   self.params.conf.email,
                'api_key'   :   self.params.conf.api_key
              });
            }
          }).on('click' + self.ns, '.js-' + self.params.widget_code + '_bind_caller_id', function () {
            var vox_config = self.params.conf || false,
              modal_obj = new Modal({
                class_name: 'modal-list modal-widget',
                init: function ($modal_body) {
                  console.log('$modal_body = ', $modal_body);
                  console.log('modal_obj = ', modal_obj);
                  self.getTemplate(
                    'bind_number',
                    {},
                    function (template, base_params) {
                      console.log('modal_obj = ', modal_obj);
                      $modal_body.html(
                        template.render(_.extend(base_params, {
                          widget_code: self.params.widget_code,
                          lang: self.i18n('settings')
                        }))
                      );
                      $modal_body
                        .trigger('modal:loaded')
                        .trigger('modal:centrify');

                      $(document).on('click' + self.ns, '#' + self.params.widget_code + '_get_code', function () {
                        var phone = $modal_body.find('.js-bind_phone_input').val();

                        vox_config = self.params.conf;
                        phone = phone.toString();
                        if (vox_config) {
                          if (phone.length > 0) {
                            $modal_body.hide();
                            self.tools.request({
                                account_id: vox_config.account_id,
                                api_key: vox_config.api_key,
                                phone: phone
                              },
                              'add_phone',
                              function (data) {
                                $modal_body.show();
                                data = data || {};
                                if (data.error) {
                                  $modal_body.find('.js-bind_phone_input').addClass('validate-has-error');
                                  $modal_body.find('.vox_imp__bind_number__error').text(data.error);
                                } else {
                                  $modal_body.find('.js-confirm_phone_input').data('callerid_id', data.callerid_id);
                                  $modal_body.find('.js-confirm_phone_input').data('phone', phone);
                                  if (data.active == true) {
                                    self.tools.set_caller_id(phone);
                                    modal_obj.destroy();
                                    $('.js-widget-save').trigger('button:save:enable');
                                    self.clickSaveButton();
                                  } else {
                                    $modal_body.find('.vox_imp__bind_number').hide();
                                    $modal_body.find('.vox_imp__bind_number__confirm').show();
                                  }
                                }
                              });
                          } else {
                            self.notifers.show_message_error({
                              text: self.i18n('settings').empty_phone,
                              without_header: true
                            });
                          }
                        } else {
                          self.notifers.show_message_error({
                            text: self.i18n('settings').empty_vox_settings,
                            without_header: true
                          });
                        }
                      })
                        .on(AMOCRM.click_event + self.ns, '#' + self.params.widget_code + '_phone_confirm', function () {
                          var code = $modal_body.find('.js-confirm_phone_input').val(),
                            callerid_id = $modal_body.find('.js-confirm_phone_input').data('callerid_id'),
                            phone = $modal_body.find('.js-confirm_phone_input').data('phone');

                          code = code.toString();
                          callerid_id = callerid_id.toString();
                          if (code.length > 0 && callerid_id > 0) {
                            $modal_body.hide();
                            self.tools.request({
                                account_id: vox_config.account_id,
                                api_key: vox_config.api_key,
                                code: code,
                                callerid_id: callerid_id
                              },
                              'activate_phone',
                              function (data) {
                                $modal_body.show();
                                data = data || {};
                                if (data.error) {
                                  $modal_body.find('.js-confirm_phone_input').addClass('validate-has-error');
                                  $modal_body.find('.vox_imp__bind_number__error').text(data.error);
                                } else {
                                  if (data.result == 1) {
                                    self.tools.set_caller_id(phone);
                                    modal_obj.destroy();
                                    $('.js-widget-save').trigger('button:save:enable');
                                    self.clickSaveButton();
                                  }
                                }
                              });
                          }
                        });
                    }
                  );
                },
                destroy: function () {
                  $(document).off('click' + self.ns, '#' + self.params.widget_code + '_get_code');
                  $(document).off('click' + self.ns, '#' + self.params.widget_code + '_phone_confirm');
                }
              });
          }).on('keyup' + self.ns, '.js-bind_phone_input', function (e) {
            var $this = $(this),
              value = $this.val();

            value = value.replace(/[^\d]/g, '');
            $this.val(value);
            e.stopPropagation();

          });

        window.AMOCRM.player_prepare[self.params.widget_code] = function ($el) {
          this.play($el, $el.attr('href'));
        };

        return true;
      },
      contacts: {
        selected: function () {
          var data = self.list_selected()['selected'],
            nothing_added = true;
          $.each(data, function (k, v) {
            (function (v) {
              var call_element = {},
                list_model = AMOCRM.data.current_list.where({id: v.id}),
                company;
              list_model = list_model[0] || {};

              call_element.element_id = v.id;
              call_element.element_type = list_model.get('element_type');
              call_element.type = list_model.get('element_type');
              call_element.phone = v.phones[0] || false;
              call_element.entity = call_element.element_type == 1 ? 'contact' : 'company';
              call_element.element = {};
              call_element.element.text = list_model.get('name')['text'];
              call_element.element.url = list_model.get('name')['url'];
              company = list_model.get('company_name') || false;
              if (company) {
                call_element.company = {};
                call_element.company.text = company.name;
                call_element.company.url = company.url;
              }
              if (call_element.phone) {
                self.__CallsList.addCall(call_element);
                nothing_added = false;
                $(document).trigger('list:cookies:update');
              } else if (nothing_added && k == data.length - 1) {
                self.notifers.show_message_error({
                  text: self.i18n('caller').nothing_to_add,
                  without_header: true
                });
              }
            })(v);
          });
        }
      },
      leads: {
        selected: function () {
          var data = self.list_selected()['selected'];
          (function (data) {
            self.tools.request({
                selected: data
              },
              'get_contacts_by_leads',
              function (data) {

                data.contacts = data.contacts || [];
                if (data.contacts.length <= 0) {
                  self.notifers.show_message_error({
                    text: self.i18n('caller').nothing_to_add,
                    without_header: true
                  });
                  return;
                }
                $.each(data.contacts, function (k, v) {
                  (function (v) {
                    var call_element = {},
                      company = false,
                      list_model = AMOCRM.data.current_list.where({id: v.id});
                    list_model = list_model[0] || {};

                    call_element.element_id = v.element_id;
                    call_element.element_type = v.element_type;
                    call_element.type = v.element_type;
                    call_element.phone = v.phone || false;
                    call_element.entity = v.entity;
                    call_element.element = v.element;
                    company = v.company || false;
                    if (typeof company == 'object') {
                      call_element.company = {};
                      call_element.company.text = company.text;
                      call_element.company.url = company.url;
                    }
                    if (call_element.phone) {
                      self.__CallsList.addCall(call_element);
                      $(document).trigger('list:cookies:update');
                    }
                  })(v);
                });
              }
            );
          })(data);
        }
      },
      destroy: function () {
        $('.' + self.params.widget_code + '_vox_implant_call').remove();
        $('body').removeClass('vox_active');
        if (self && self.__CallsList && self.__CallsList.is_parent_widget) {
          localStorage.removeItem(self.params.widget_code + '_inited');
          if (self.__CallsList._voxImplant && _.isFunction(self.__CallsList._voxImplant.disconnect)) {
            self.__CallsList._voxImplant.disconnect();
          }
        }
      }
    };

    return this;
  };

  return CustomWidget;
});
