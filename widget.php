<?php
namespace amo__vox__implant;
defined('LIB_ROOT') or die();

class Widget extends \Helpers\Widgets
{

	private $point = /* 'Ссылка на API' */;
	private $acc_name = /* 'Имя аккаунта' */;
	private $api_key = /* 'Ключ API' */;

	private $minSuggest = 3;

    private function post( $data, $method, $acc_id=false, $api_key=false) {
        $path = $this->point.$method.'/?';

        if(isset($data['cmd'])) {
            $path .= 'cmd='.urlencode($data['cmd']).'&';
            unset($data['cmd']);
        }

        $path .= ($acc_id?'account_id='.$acc_id:'parent_account_name='.$this->acc_name).'&';
        $path .= ($api_key?'api_key='.$api_key:'parent_account_api_key='.$this->api_key).'&';

        foreach  ($data as $key=>$val)
        	$path .= $key.'='.urlencode($val).'&';

        return \Helpers\Curl::init($path);
    }

    private function error($text=false){ // результат - ошибка
        if (!$text) $text=\Helpers\I18n::get('server.post_error');
        ob_end_clean();
        die('{"error": "'.htmlspecialchars($text).'"}');
    }

    private function ok($arr){ // результат - ок
        ob_end_clean();
        die(json_encode($arr));
    }

    private function param($k,$default=NULL){
        $res = \Helpers\Route::param($k);
        return $res?$res:$default;
    }

    private function get($arr,$key){
    	return array_key_exists($key,$arr)?$arr[$key]:'';
    }

    private function getRandomString($length = 10) {
	    $validCharacters = "1234567890abcdefghijklmnopqrstuxyvwzABCDEFGHIJKLMNOPQRSTUXYVWZ+-*#@!?";
	    $validCharNumber = strlen($validCharacters);

	    $result = "";

	    for ($i = 0; $i < $length; $i++) {
	        $index = mt_rand(0, $validCharNumber - 1);
	        $result .= $validCharacters[$index];
	    }

	    return $result;
	}

	private function get_scenarios($data) {
		$result = array();
		if(!empty($data['account_id']) && !empty($data['api_key'])) {
			$result = $this->post(array(),'GetScenarios',$data['account_id'],$data['api_key']);
		}
		return $result;
	}

	private function get_rules($data) {
		$result = array();
		if(!empty($data['account_id']) && !empty($data['api_key'])) {
			$result = $this->post(array(
				 'application_id' => $data['application_id'],
			),'GetRules', $data['account_id'], $data['api_key']);
		}
		return $result;
	}

	private function add_rule($data) {
		if(!empty($data)) {
			$res = $this->post(array(
				'application_id'	=> $data['application_id'],
				'rule_name'			=> $data['rule_name'],
				'rule_pattern'		=> $data['rule_pattern']
		   ),'AddRule',$data['account_id'],$data['api_key']);

			if (array_key_exists('result',$res)){
				$rule_id = $res['rule_id'];
				$this->post(array(
					'scenario_id'=>$data['scenario_id'],
					'rule_id'=>$rule_id,
			   	),'BindScenario', $data['account_id'], $data['api_key']);
			}
		}
	}

	private function add_scenario($data, $bind = false) {
		$result = $this->post($data,'AddScenario',$data['account_id'],$data['api_key']);
		if (array_key_exists('result',$result) && $bind) {
			$rule = array(
				'application_id' => $data['application_id'],
				'account_id'	 => $data['account_id'],
				'api_key'		 => $data['api_key'],
				'scenario_id'	 => $result['scenario_id']
			);
			switch($bind){
				case 'incomming':
					$rule['rule_name'] = 'Imcomming Call';
					$rule['rule_pattern'] = '.*';
					break;
				case 'outcomming':
					$rule['rule_name'] = 'Outcomming Call';
					$rule['rule_pattern'] = '000.*';
					break;
			}
			if(!empty($rule) && is_array($rule)) {
				$this->add_rule($rule);
			}
		}
		return $result;
	}

	private function add_scenarios($data) {
		$scenarios = $result = array();
		if(!empty($data['account_id']) && !empty($data['api_key'])) {
			$scenarios[] = array(
				'rule'		=> 'outcomming',
				'scenario_name' 	=> 'amocrm outcomming call',
				'scenario_script'	=> /* Ваш скрипт работы с входящим звонка */
			);
			$scenarios[] = array(
				'rule'				=> 'incomming',
				'scenario_name' 	=> 'amocrm incomming call',
				'scenario_script'	=> /* Ваш скрипт работы с исходящим звонка */
			);

			$params = $data;
			foreach($scenarios as $scenario) {
				$rule_type = $scenario['rule'];
				unset($scenario['rule']);
				$params = array_merge($params, $scenario);
				$scenario_result = $this->add_scenario($params, $rule_type);
				if (array_key_exists('result', $scenario_result)) {
					$result[] = $scenario_result;
				}
			}
			return $result;
		}
	}

	private function getok($ok) {
		$application_name = 'amocrm';
		$scenario_name = 'amocrm call record';
		$rule_name = $scenario_name;

		$res = $this->post(array(
			'application_name'=>$application_name
		),'AddApplication',$ok['account_id'],$ok['api_key']);

		if (array_key_exists('result',$res)) {
			$ok['application_id'] = $res['application_id'];
			$ok['application_name'] = $res['application_name'];

			if(!empty($ok['account_id']) && !empty($ok['api_key'])) {
				$res['scenarios'] =  $this->add_scenarios(array(
						  'account_id' 	=> $ok['account_id'],
						  'api_key'		=> $ok['api_key'],
						  'application_id' => $ok['application_id']
					));
			}
		}
		$ok = array_merge($ok, $res);
		$this->ok($ok);
	}

	protected function endpoint_auth_widget(){
		$login = $this->param('login');
		$password = $this->param('password');

		$res = $res = $this->post(array(
	    		'account_email'=>$login,
	    		'account_password'=>$password
			),'Logon');

		if (array_key_exists('result',$res)){
			$this->getok(array(
    			'email'=>$res['account_email'],
    			'password'=>$password,
    			'acc_name' => $res['account_name'],
    			'account_id' => $res['account_id'],
    			'api_key' => $res['api_key']
			));
		}
		$this->error('('.$res['error']['code'].') '.$res['error']['msg']);
	}

	private function getphone($phone,$account_id,$api_key){
		$ok = false;
		$res = $this->post(array(),'GetCallerIDs',$account_id,$api_key);
		if (array_key_exists('result',$res)){

			foreach ($res['result'] as $ph){
				if ($ph['callerid_number'] == $phone){
					$ok = array('callerid_id'=> $ph['callerid_id'],'active'=>$ph['active']==1);
					if ($ph['active']==1) $this->ok($ok);
					break;
				}
			}
		}
		return $ok;
	}

    protected  function endpoint_get_contacts_by_leads(){
		$selected = $this->param('selected');
		$result = array(
			'contacts' => array()
		);
		if(is_array($selected)) {
			$leads = array();
			foreach($selected as $lead) {
				if(!in_array($lead['id'], $leads)) {
					$leads[] = intval($lead['id']);
				}
			}
			if(!empty($leads)) {
				$res = $this->contacts->links($leads);
				if(is_array($res)) {
					$count = sizeof($res);
					$contacts = array();
					foreach($res as $link) {
						if($link['lead_id'] > 0 && empty($contacts[$link['lead_id']])) {
							$contacts[$link['lead_id']] = $link['contact_id'];
						}
					}

					if(!empty($contacts)) {
						$contacts = $this->contacts->get(array('id' => $contacts));
						if(is_array($contacts)) {
							$result['contacts'] = array();
							foreach($contacts as $contact) {
								$phone = '';
								if(!empty($contact['custom_fields'])){
									foreach($contact['custom_fields'] as $field) {
										if(!empty($field['code']) && $field['code'] == 'PHONE') {
											if(!empty($field['values']) && !empty($field['values'][0]) && !empty($field['values'][0]['value'])) {
												$phone = $field['values'][0]['value'];
											}
										} else {
											continue;
										}
									}
									if(!empty($phone)){
										$element = array(
											'element_id' 	=> $contact['id'],
											'element_type'	=> ($contact['type'] == 'contact')?1:3,
											'type'	=> ($contact['type'] == 'contact')?1:3,
											'phone' => $phone,
											'entity' => $contact['type'],
											'element' => array(
												'text' => $contact['name'],
												'url' => ($contact['type'] == 'contact')?'/contacts/detail/'.$contact['id']:'/companies/detail/'.$contact['id'],
											)
										);

										if(!empty($contact['linked_company_id']) && !empty($contact['company_name'])) {
											$element['company'] = array(
												'text' => $contact['company_name'],
												'url' => '/companies/detail/'.$contact['linked_company_id'],
											);
										}
										$result['contacts'][] = $element;
									}
								}
							}
						}
					}
				}
			}
		}
		if(empty($result)) {
			$result['error'] = 'elements_empty';
		} else if (!empty($count)) {
			if($count < $result['contacts']){
				$result['error'] = 'some_contacts_empty';
			}
		}
		echo json_encode($result);die;
    }

    private function get_sip_registration($account_info){
		if(is_array($account_info) && !empty($account_info['account_id']) && !empty($account_info['api_key'])) {
			$res = $this->post(
				array(),
				'GetSipRegistrations',
				$account_info['account_id'],
				$account_info['api_key']
			);
		}
		if(empty($res['result'])) {
            $res = false;
        }
        return $res;
    }

    private function create_sip_registration($params, $account_info){
        if(!empty($params) && is_array($params)) {
            if(!empty($params['username']) && !empty($params['proxy'])) {
                $data = array();
                $data['cmd'] = 'CreateSipRegistration';
                foreach(array('username','proxy','outbound_proxy','password') as $key) {
                    if(!empty($params[$key])) {
                        $data[$key] = $params[$key];
                    }
                }
                $res = $this->post(
                    $data,
                    'CreateSipRegistration',
                    $account_info['account_id'],
                    $account_info['api_key']
                );
                $this->bind_registration_to_account($res['sip_registration_id'], $account_info);
            }
        }
    }

    private function bind_registration_to_account($sip_registration_id, $account_info) {
        $sip_registration_id = intval($sip_registration_id);
        if($sip_registration_id > 0) {
            $res = $this->post(
                array(
                    'sip_registration_id'   => $sip_registration_id,
                    'application_id'        => $account_info['application_id']
                ),
                'BindSipRegistration',
                $account_info['account_id'],
                $account_info['api_key']
            );
        }
    }

    private function delete_sip_registration($registrations, $account_info){
        if(!empty($registrations) && is_array($registrations)) {
            foreach($registrations as $sip_reg_id) {
                $res = $this->post(
                    array(
                        'sip_registration_id' => $sip_reg_id
                    ),
                    'DeleteSipRegistration',
                    $account_info['account_id'],
                    $account_info['api_key']
                );
            }
        }
    }

    protected function endpoint_sip_reg() {
		$account = $this->account->current();
		if(!empty($account['widget']) && !empty($account['widget']['conf'])) {
			
			if (!is_array($account['widget']['conf'])) {
            	$conf = json_decode($account['widget']['conf'], true);
        	}else{
        		$conf = $account['widget']['conf'];
        	}			
		}

		
        $sip_domain = $this->param('custom_sip_line');
        $auth_data = $this->param('auth_data');
        if(!empty($conf) && strlen($sip_domain) > 0 && !empty($auth_data)) {
            $registrations = $this->get_sip_registration($conf);
            $reg_users = $reg_for_delete = $form_data = array();
            foreach($auth_data as $data) {
                $form_data[$data['login']] =  array(
                    'username' => $data['login'],
                    'proxy' => $sip_domain,
                    'outbound_proxy' => '',
                    'password' => $data['password']
                );
            }
            $sip_logins = array_keys($form_data);
            if(is_array($registrations['result'])){
                foreach($registrations['result'] as $registration) {
                    if(in_array($registration['username'], $reg_users) ||
                        (isset($registration['error_message']) && $registration['successful'] === false)){
                        $reg_for_delete[] = $registration['sip_registration_id'];
                    } else {
                        if(!in_array($registration['username'], $sip_logins)){
                            $reg_for_delete[] = $registration['sip_registration_id'];
                        }
                        $reg_users[$registration['sip_registration_id']] = $registration['username'];
                    }
                }
            }

            $els_for_add = array_diff($sip_logins, $reg_users);
            foreach($els_for_add as $login) {
                if(!empty($form_data[$login])) {
                    $this->create_sip_registration(
                        $form_data[$login],
                        $conf
                    );
                }
            }
            if(sizeof($reg_for_delete) > 0){
                $this->delete_sip_registration($reg_for_delete, $conf);
            }
        }
        $result = array('status' => true);
        echo json_encode($result);
        exit;
    }

	protected function endpoint_check_user(){
		

        $user_id  = intval($this->param('user_id'));
        $user_ext = $this->param('user_ext');

        $user_ext = (is_array($user_ext))?$user_ext:array();

        if(!empty($user_ext['login'])) {
            $user_ext = $user_ext['login'];
        } else {
            $user_ext = $user_id;
        }

        $account    = $this->account->current();
        $settings   = $account['widget']['conf'];       

        if (!is_array($settings)) {
            $settings = json_decode($settings, true);
        }             
        
        if(!empty($settings)) {
            $account_id = $settings['account_id'];
            $api_key    = $settings['api_key'];
            $application_id = $settings['application_id'];
            $password   = $settings['password'];
        } else {
            $this->error('empty settings');
        }

        $display = $login = 'amocrm-' . $user_ext . '-' . $account_id;
        
        $res = $this->post(
            array(
                'user_name'=>$login
            ),
            'GetUsers',
            $account_id,
            $api_key
        );
        $result = array();
        if (array_key_exists('result',$res) && $login && $password && $account_id && $api_key && $application_id) {
            if ($res['count']==1){
                $res = $res['result'][0];
                $res['result'] = 1;
            } else {
                foreach ($account['users'] as $u) {
                    if ($u['id']== $user_id) {
                        $display = trim($u['name'].' '.$u['last_name']);
                    }
                }

                $res = $this->post(
                    array(
                        'user_name'=>$login,
                        'user_display_name'=>$display,
                        'user_password'=>$password
                    ),
                    'AddUser',
                    $account_id,
                    $api_key
                );
            }

            if (array_key_exists('result',$res)) {
                $res = $this->post(array(
                    'user_id'=>$res['user_id'],
                    'application_id'=>$application_id
                ),'BindUser',$account_id,$api_key);

                if (array_key_exists('result',$res)) {
                    $this->ok(json_encode(array('login' => $login,'result'=>$result)));
                }
            }
        }

		$this->error('fault');

	}

	protected function endpoint_add_phone(){
		
		$phone_number = $this->param('phone');
		$api_key = $this->param('api_key');
		$account_id = $this->param('account_id');

		$phone = $this->getphone($phone_number,$account_id,$api_key);

		if (!$phone) {
			$res = $this->post(array(
				'callerid_number'=>$phone_number
			),'AddCallerID',$account_id,$api_key);
			if (array_key_exists('result',$res)) {
				$phone = $this->getphone($phone_number,$account_id,$api_key);
			}
		}

		if ($phone) {
    		$res = $this->post(
				array(
					'callerid_id'=>$phone['callerid_id']
				),
				'VerifyCallerID',
				$account_id,
				$api_key
			);

			if (array_key_exists('result',$res)){
				$this->ok($phone);
			}
    	}

		$this->error('('.$res['error']['code'].') '.$res['error']['msg']);
	}

	protected function endpoint_activate_phone() {
		$callerid_id = intval($this->param('callerid_id'));
		$code = $this->param('code');
		$api_key = $this->param('api_key');
		$account_id = $this->param('account_id');

		$res = $this->post(
			array(
				'callerid_id'=>$callerid_id,
				'verification_code'=>$code
		   	),
			'ActivateCallerID',
			$account_id,
			$api_key
		);
		if (array_key_exists('result',$res)){
			$this->ok($res);
		} else {
			$this->error('('.$res['error']['code'].') '.$res['error']['msg']);
		}
	}

	protected function endpoint_balance(){
		$api_key = $this->param('api_key');
		$account_id = $this->param('account_id');
		$res = $this->post(array(
    		'return_live_balance'=>1
		),'GetAccountInfo',$account_id,$api_key);

		if (array_key_exists('result',$res)){
			$this->ok(array('balance'=>number_format($res['result']['balance'], 2, '.', ' ' ).' '.$res['result']['currency']));
		} else {
			$this->error('fail');
		}
	}

    protected function endpoint_register_widget(){
    	$cnt = 2;
    	$acc = $this->account->current();

    	$email = $acc['id'].rand(0, 9).'-'.$this->param('amouser');
    	$acc_name = 'amo-'.$acc['id'].'-'.rand(0, 9);
    	$password = $this->getRandomString();

    	do {
	    	$res = $this->post(array(
	    		'account_name'	=>$acc_name,
	    		'account_email'	=>$email,
	    		'account_password'=>$password,
	    		'active'		=>'true',
				'language_code'	=>'ru'
			),'AddAccount');

	    	if (array_key_exists('result',$res)) $cnt=0;else $cnt--;

    	} while ( $cnt );

    	if (array_key_exists('result',$res)){
            $this->transfer_money_to_child($res['account_id']);
            $this->getok(array(
    			'email'=>$email,
    			'password'=>$password,
    			'acc_name' => $acc_name,
    			'account_id' => $res['account_id'],
    			'api_key' => $res['api_key']
			));
    	}

    	$this->error('('.$res['error']['code'].') '.$res['error']['msg']);

	}

    protected function transfer_money_to_child($account_id){
        $path = $this->point.'TransferMoneyToChildAccount'.'/?';
        $data = array(
            'account_name'      => $this->acc_name,
            'api_key'           => $this->api_key,
            'amount'            => 5,
            'child_account_id'  => $account_id
        );

        foreach  ($data as $key=>$val)
            $path .= $key.'='.urlencode($val).'&';

        return \Helpers\Curl::init($path);
    }

    private function time_offset($account){
        $cur_acc_time_zone=new \DateTimeZone($account['timezone']);
        $cur_acc_time=new \DateTime();
        $cur_acc_time-> setTimezone( $cur_acc_time_zone );
        return $cur_acc_time->getOffset();
    }

}

?>
