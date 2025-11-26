import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class GeminiImageGenerator implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Gemini Image Generator',
		name: 'geminiImageGenerator',
		icon: 'file:gemini.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Generate images using Google Gemini API (gemini-3-pro-image-preview)',
		defaults: {
			name: 'Gemini Image Generator',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'geminiApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: {
					rows: 6,
				},
				default: 'Tạo ảnh đại diện cho bài viết về chủ đề: "{{ $json.title }}"\nYêu cầu: KHÔNG chèn chữ, chỉ là ảnh để làm nổi bật ý nghĩa của tiêu đề trên.',
				required: true,
				description: 'Prompt for image generation. Use expressions like {{ $json.title }} to get data from previous nodes.',
			},
			{
				displayName: 'Aspect Ratio',
				name: 'aspectRatio',
				type: 'options',
				options: [
					{
						name: '16:9',
						value: '16:9',
					},
					{
						name: '9:16',
						value: '9:16',
					},
					{
						name: '4:3',
						value: '4:3',
					},
					{
						name: '3:4',
						value: '3:4',
					},
					{
						name: '1:1',
						value: '1:1',
					},
				],
				default: '16:9',
				description: 'The aspect ratio of the generated image',
			},
			{
				displayName: 'Image Size',
				name: 'imageSize',
				type: 'options',
				options: [
					{
						name: '1K (1024px)',
						value: '1K',
					},
					{
						name: '2K (2048px)',
						value: '2K',
					},
					{
						name: '4K (4096px)',
						value: '4K',
					},
				],
				default: '1K',
				description: 'The size of the generated image',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{
						name: 'Binary (for upload)',
						value: 'binary',
					},
					{
						name: 'Base64',
						value: 'base64',
					},
					{
						name: 'JSON Response (debug)',
						value: 'json',
					},
				],
				default: 'binary',
				description: 'How to output the generated image',
			},
			{
				displayName: 'Binary Property Name',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				displayOptions: {
					show: {
						outputFormat: ['binary'],
					},
				},
				description: 'Name of the binary property to store the image',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const model = 'gemini-3-pro-image-preview';
				const prompt = this.getNodeParameter('prompt', i) as string;
				const aspectRatio = this.getNodeParameter('aspectRatio', i) as string;
				const imageSize = this.getNodeParameter('imageSize', i) as string;
				const outputFormat = this.getNodeParameter('outputFormat', i) as string;
				const credentials = await this.getCredentials('geminiApi');

				// Prepare request body (REST API format)
				const requestBody = {
					contents: [
						{
							role: 'user',
							parts: [
								{
									text: prompt,
								},
							],
						},
					],
					generationConfig: {
						responseModalities: ['IMAGE', 'TEXT'],
						imageConfig: {
							aspectRatio: aspectRatio,
							imageSize: imageSize,
						},
					},
				};

				// Make API request using streamGenerateContent endpoint
				const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;
				const response = await this.helpers.request({
					method: 'POST',
					url: apiUrl,
					body: requestBody,
					json: true,
					qs: {
						key: credentials.apiKey as string,
					},
				});

				// For JSON debug output
				if (outputFormat === 'json') {
					returnData.push({
						json: {
							...items[i].json,
							response,
						},
					});
					continue;
				}

				// Parse the streaming response to extract image data
				let imageData: string | null = null;
				let mimeType = 'image/png';

				// Response can be array of chunks (streaming) or single object
				const chunks = Array.isArray(response) ? response : [response];

				for (const chunk of chunks) {
					if (!chunk.candidates || !Array.isArray(chunk.candidates)) {
						continue;
					}

					for (const candidate of chunk.candidates) {
						if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts)) {
							continue;
						}

						for (const part of candidate.content.parts) {
							// Check for inlineData (SDK format - camelCase)
							if (part.inlineData && part.inlineData.data) {
								imageData = part.inlineData.data;
								mimeType = part.inlineData.mimeType || 'image/png';
								break;
							}
							// Also check for inline_data (REST API format - snake_case) as fallback
							if (part.inline_data && part.inline_data.data) {
								imageData = part.inline_data.data;
								mimeType = part.inline_data.mime_type || 'image/png';
								break;
							}
						}
						if (imageData) break;
					}
					if (imageData) break;
				}

				if (!imageData) {
					// Provide helpful error with response structure
					throw new NodeOperationError(
						this.getNode(),
						`No image data found in response. Response structure: ${JSON.stringify(response, null, 2).substring(0, 1000)}...`,
						{ itemIndex: i }
					);
				}

				// Output based on selected format
				if (outputFormat === 'binary') {
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
					const buffer = Buffer.from(imageData, 'base64');

					returnData.push({
						json: {
							...items[i].json,
							mimeType,
							fileSize: buffer.length,
						},
						binary: {
							[binaryPropertyName]: await this.helpers.prepareBinaryData(
								buffer,
								`generated-image-${Date.now()}.${mimeType.split('/')[1]}`,
								mimeType
							),
						},
					});
				} else if (outputFormat === 'base64') {
					returnData.push({
						json: {
							...items[i].json,
							imageData,
							mimeType,
						},
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
