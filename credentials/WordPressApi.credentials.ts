import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WordPressApi implements ICredentialType {
	name = 'wordPressApi';
	displayName = 'WordPress API';
	documentationUrl = 'https://developer.wordpress.org/rest-api/';
	properties: INodeProperties[] = [
		{
			displayName: 'WordPress URL',
			name: 'url',
			type: 'string',
			default: '',
			placeholder: 'https://yourdomain.com',
			required: true,
			description: 'The URL of your WordPress site (without trailing slash)',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			description: 'WordPress username',
		},
		{
			displayName: 'Application Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'WordPress Application Password (create in Users > Profile > Application Passwords)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.username}}',
				password: '={{$credentials.password}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url}}',
			url: '/wp-json/wp/v2/users/me',
		},
	};
}
