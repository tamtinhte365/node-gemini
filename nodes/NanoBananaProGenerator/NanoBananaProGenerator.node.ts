import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class NanoBananaProGenerator implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nano Banana Pro Generator',
		name: 'nanoBananaProGenerator',
		icon: 'file:gemini.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Generate images using Google Gemini API with auto-optimization and retry logic',
		defaults: {
			name: 'Nano Banana Pro Generator',
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
				default: '',
				required: true,
				description: 'Prompt for image generation. You can use fixed text or expressions like {{ $json.title }} to get data from previous nodes.',
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
			{
				displayName: 'Auto-Optimize Image',
				name: 'autoOptimize',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						outputFormat: ['binary'],
					},
				},
				description: 'Whether to automatically compress and optimize the generated image to reduce file size',
			},
			{
				displayName: 'Optimization Quality',
				name: 'optimizationQuality',
				type: 'number',
				default: 85,
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				displayOptions: {
					show: {
						outputFormat: ['binary'],
						autoOptimize: [true],
					},
				},
				description: 'Image quality after optimization (1-100). Higher = better quality but larger file size.',
			},
			{
				displayName: 'Max Retry Attempts',
				name: 'maxRetries',
				type: 'number',
				default: 3,
				typeOptions: {
					minValue: 0,
					maxValue: 5,
				},
				description: 'Number of retry attempts if the API request fails (0-5)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// Helper function for retry logic with exponential backoff
		const makeRequestWithRetry = async (
			apiUrl: string,
			requestBody: any,
			apiKey: string,
			maxRetries: number,
			itemIndex: number,
		): Promise<any> => {
			let lastError: any = null;
			const errorLog: string[] = [];

			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					const response = await this.helpers.request({
						method: 'POST',
						url: apiUrl,
						body: requestBody,
						json: true,
						timeout: 120000, // 120 seconds timeout per request
						qs: {
							key: apiKey,
						},
					});
					return response;
				} catch (error) {
					lastError = error;
					const errorMsg = error instanceof Error ? error.message : String(error);
					const attemptLog = `Attempt ${attempt + 1}/${maxRetries + 1} failed: ${errorMsg}`;
					errorLog.push(attemptLog);

					// Don't retry on the last attempt
					if (attempt < maxRetries) {
						// Exponential backoff: 2s, 4s, 8s
						const delayMs = Math.pow(2, attempt + 1) * 1000;
						errorLog.push(`Retrying in ${delayMs / 1000}s...`);
						await new Promise(resolve => setTimeout(resolve, delayMs));
					}
				}
			}

			// Create detailed error message
			const errorDetails = {
				message: lastError instanceof Error ? lastError.message : 'Unknown error',
				stack: lastError instanceof Error ? lastError.stack : undefined,
				attempts: maxRetries + 1,
				attemptLog: errorLog,
				apiUrl,
				statusCode: lastError?.statusCode,
				cause: lastError?.cause,
			};

			throw new NodeOperationError(
				this.getNode(),
				`❌ API Request Failed\n\n${JSON.stringify(errorDetails, null, 2)}`,
				{ itemIndex }
			);
		};

		// Helper function for image optimization
		const optimizeImage = async (buffer: Buffer, quality: number, mimeType: string): Promise<Buffer> => {
			try {
				// Try to use sharp if available
				const sharp = await import('sharp');
				const sharpInstance = sharp.default(buffer);

				// Optimize based on actual mime type
				if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
					return await sharpInstance.jpeg({ quality }).toBuffer();
				} else if (mimeType.includes('png')) {
					return await sharpInstance.png({ quality, compressionLevel: 9 }).toBuffer();
				} else if (mimeType.includes('webp')) {
					return await sharpInstance.webp({ quality }).toBuffer();
				} else {
					// Unsupported format, return original
					return buffer;
				}
			} catch (error) {
				// If sharp is not available or optimization fails, return original buffer
				// This allows the node to work even without sharp installed
				return buffer;
			}
		};

		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const model = 'gemini-3-pro-image-preview';
				const prompt = this.getNodeParameter('prompt', i) as string;
				const aspectRatio = this.getNodeParameter('aspectRatio', i) as string;
				const imageSize = this.getNodeParameter('imageSize', i) as string;
				const outputFormat = this.getNodeParameter('outputFormat', i) as string;
				const maxRetries = this.getNodeParameter('maxRetries', i) as number;
				const credentials = await this.getCredentials('geminiApi');

				// Validate prompt is not empty
				if (!prompt || prompt.trim().length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						'Prompt cannot be empty. Please enter a valid prompt for image generation.',
						{ itemIndex: i }
					);
				}

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

				// Make API request with retry logic
				const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;
				const response = await makeRequestWithRetry(
					apiUrl,
					requestBody,
					credentials.apiKey as string,
					maxRetries,
					i
				);

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
					const autoOptimize = this.getNodeParameter('autoOptimize', i) as boolean;
					const originalBuffer = Buffer.from(imageData, 'base64');
					const originalSize = originalBuffer.length;

					// Apply optimization if enabled
					let finalBuffer: Buffer;
					if (autoOptimize) {
						const quality = this.getNodeParameter('optimizationQuality', i) as number;
						const optimizedBuffer = await optimizeImage(originalBuffer, quality, mimeType);
						finalBuffer = Buffer.from(optimizedBuffer);
					} else {
						finalBuffer = originalBuffer;
					}

					returnData.push({
						json: {
							...items[i].json,
							mimeType,
							fileSize: finalBuffer.length,
							originalSize: autoOptimize ? originalSize : undefined,
							optimized: autoOptimize,
							compressionRatio: autoOptimize ? `${((1 - finalBuffer.length / originalSize) * 100).toFixed(1)}%` : undefined,
						},
						binary: {
							[binaryPropertyName]: await this.helpers.prepareBinaryData(
								finalBuffer,
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
					// Comprehensive error details for continue on fail mode
				const errorDetails = {
					error: error instanceof Error ? error.message : 'Unknown error',
					errorType: error instanceof Error ? error.constructor.name : typeof error,
					stack: error instanceof Error ? error.stack : undefined,
					statusCode: (error as any)?.statusCode,
					statusMessage: (error as any)?.statusMessage,
					cause: (error as any)?.cause,
					timestamp: new Date().toISOString(),
					itemIndex: i,
					prompt: this.getNodeParameter('prompt', i) as string,
				};
				const errorMessage = errorDetails.error;

					returnData.push({
						json: {
							success: false,
							...errorDetails,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				// Enhanced error for fail mode
			const enhancedError = new NodeOperationError(
				this.getNode(),
				error instanceof Error ? error.message : 'Unknown error occurred',
				{
					itemIndex: i,
					description: `Full error details:\n${JSON.stringify({
						message: error instanceof Error ? error.message : String(error),
						type: error instanceof Error ? error.constructor.name : typeof error,
						stack: error instanceof Error ? error.stack : undefined,
						statusCode: (error as any)?.statusCode,
						cause: (error as any)?.cause,
					}, null, 2)}`,
				}
			);
			throw enhancedError;
			}
		}

		return [returnData];
	}
}
