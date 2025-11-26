import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class WordPressFeaturedImage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WordPress Featured Image',
		name: 'wordPressFeaturedImage',
		icon: 'file:wordpress.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Set post featured image',
		description: 'Upload image to WordPress and set as post featured image',
		defaults: {
			name: 'WordPress Featured Image',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'wordPressApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Post ID',
				name: 'postId',
				type: 'number',
				default: 0,
				required: true,
				description: 'The ID of the WordPress post to set the featured image for',
				placeholder: '123',
			},
			{
				displayName: 'Binary Property Name',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'Name of the binary property containing the image from previous node',
			},
			{
				displayName: 'Image Title',
				name: 'imageTitle',
				type: 'string',
				default: '',
				placeholder: 'Featured Image',
				description: 'Optional title for the uploaded image in WordPress Media Library',
			},
			{
				displayName: 'Image Alt Text',
				name: 'imageAlt',
				type: 'string',
				default: '',
				placeholder: 'Alt text for SEO',
				description: 'Optional alt text for the image',
			},
			{
				displayName: 'Max Retry Attempts',
				name: 'maxRetries',
				type: 'number',
				default: 2,
				typeOptions: {
					minValue: 0,
					maxValue: 5,
				},
				description: 'Number of retry attempts if upload or update fails (0-5)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Helper function for retry logic
		const makeRequestWithRetry = async (
			requestFn: () => Promise<any>,
			maxRetries: number,
			operationName: string,
			itemIndex: number,
		): Promise<any> => {
			let lastError: Error | null = null;

			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					return await requestFn();
				} catch (error) {
					lastError = error instanceof Error ? error : new Error('Unknown error');

					if (attempt < maxRetries) {
						const delayMs = Math.pow(2, attempt + 1) * 1000;
						await new Promise(resolve => setTimeout(resolve, delayMs));
					}
				}
			}

			throw new NodeOperationError(
				this.getNode(),
				`${operationName} failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
				{ itemIndex }
			);
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const postId = this.getNodeParameter('postId', i) as number;
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
				const imageTitle = this.getNodeParameter('imageTitle', i) as string;
				const imageAlt = this.getNodeParameter('imageAlt', i) as string;
				const maxRetries = this.getNodeParameter('maxRetries', i) as number;
				const credentials = await this.getCredentials('wordPressApi');

				// Validate Post ID
				if (!postId || postId <= 0) {
					throw new NodeOperationError(
						this.getNode(),
						'Post ID must be a positive number',
						{ itemIndex: i }
					);
				}

				// Get binary data
				const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
				const imageBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

				// Prepare WordPress API base URL
				const wpUrl = (credentials.url as string).replace(/\/$/, '');
				const apiBase = `${wpUrl}/wp-json/wp/v2`;

				// Prepare filename and extension
				const fileName = binaryData.fileName || `image-${Date.now()}.jpg`;
				const mimeType = binaryData.mimeType || 'image/jpeg';

				// Step 1: Upload image to WordPress Media Library
				const uploadRequest = async () => {
					const headers: any = {
						'Content-Type': mimeType,
						'Content-Disposition': `attachment; filename="${fileName}"`,
					};

					// Add title and alt text as headers if provided
					if (imageTitle) {
						headers['X-WP-Title'] = imageTitle;
					}
					if (imageAlt) {
						headers['X-WP-Alt-Text'] = imageAlt;
					}

					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: `${apiBase}/media`,
						body: imageBuffer,
						headers,
						auth: {
							username: credentials.username as string,
							password: credentials.password as string,
						},
						timeout: 120000,
					});

					return response;
				};

				const uploadResponse = await makeRequestWithRetry(
					uploadRequest,
					maxRetries,
					'Image upload',
					i
				);

				const mediaId = uploadResponse.id;

				if (!mediaId) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to get media ID from upload response: ${JSON.stringify(uploadResponse).substring(0, 500)}`,
						{ itemIndex: i }
					);
				}

				// Update title and alt text if provided (WordPress doesn't support headers for these)
				if (imageTitle || imageAlt) {
					const updateMediaRequest = async () => {
						const updateBody: any = {};
						if (imageTitle) {
							updateBody.title = imageTitle;
						}
						if (imageAlt) {
							updateBody.alt_text = imageAlt;
						}

						return await this.helpers.httpRequest({
							method: 'POST',
							url: `${apiBase}/media/${mediaId}`,
							body: updateBody,
							headers: {
								'Content-Type': 'application/json',
							},
							auth: {
								username: credentials.username as string,
								password: credentials.password as string,
							},
							timeout: 60000,
						});
					};

					await makeRequestWithRetry(
						updateMediaRequest,
						maxRetries,
						'Media metadata update',
						i
					);
				}

				// Step 2: Set as featured image for post
				const updatePostRequest = async () => {
					return await this.helpers.httpRequest({
						method: 'POST',
						url: `${apiBase}/posts/${postId}`,
						body: {
							featured_media: mediaId,
						},
						headers: {
							'Content-Type': 'application/json',
						},
						auth: {
							username: credentials.username as string,
							password: credentials.password as string,
						},
						timeout: 60000,
					});
				};

				const updateResponse = await makeRequestWithRetry(
					updatePostRequest,
					maxRetries,
					'Post update',
					i
				);

				// Return success data with detailed logging
				returnData.push({
					json: {
						...items[i].json,
						success: true,
						postId: postId,
						mediaId: mediaId,
						featuredMediaUrl: uploadResponse.source_url || uploadResponse.guid?.rendered,
						mediaTitle: imageTitle || uploadResponse.title?.rendered,
						mediaAltText: imageAlt,
						postTitle: updateResponse.title?.rendered,
						postUrl: updateResponse.link,
						operation: 'featured_image_updated',
						log: {
							step1: 'Image uploaded to Media Library',
							step2: imageTitle || imageAlt ? 'Media metadata updated' : 'Skipped metadata update',
							step3: 'Featured image set for post',
						},
					},
					pairedItem: {
						item: i,
					},
				});

			} catch (error) {
				if (this.continueOnFail()) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					returnData.push({
						json: {
							...items[i].json,
							success: false,
							error: errorMessage,
							errorDetails: error instanceof Error ? error.stack : undefined,
							operation: 'featured_image_failed',
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
