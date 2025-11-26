# n8n-wordpress-nano-banana

![npm version](https://img.shields.io/npm/v/n8n-wordpress-nano-banana)
![npm downloads](https://img.shields.io/npm/dt/n8n-wordpress-nano-banana)
![license](https://img.shields.io/npm/l/n8n-wordpress-nano-banana)

Generate images using Google Gemini API in your n8n workflows. Perfect for automatically creating WordPress featured images from post titles.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## ✨ Features

- 🎨 Generate images using Google Gemini API
- 🔄 Dynamic prompt templating with `{{input}}` placeholder
- 📐 Customizable aspect ratios (16:9, 9:16, 4:3, 3:4, 1:1)
- 📏 Multiple image sizes (1K, 2K, 4K)
- 📤 Output as binary (for upload), base64, or JSON
- 🌐 Perfect for WordPress featured image automation
- 🇻🇳 Full Vietnamese documentation available

## 📦 Installation

### From n8n (Recommended)

1. Open n8n
2. Go to **Settings** → **Community Nodes**
3. Click **Install**
4. Enter: `n8n-wordpress-nano-banana`
5. Click **Install**
6. Restart n8n (if required)

### From npm

For self-hosted n8n:

```bash
cd ~/.n8n
npm install n8n-wordpress-nano-banana
# Restart n8n
```

### For Development

```bash
git clone https://github.com/tamtinhte365/n8n-wordpress-nano-banana.git
cd n8n-wordpress-nano-banana
npm install
npm run build
npm link
```

## 🚀 Quick Start

### 1. Get Gemini API Key

Visit [Google AI Studio](https://makersuite.google.com/app/apikey) to get your free API key.

### 2. Add Credentials in n8n

1. Go to **Credentials** → **New**
2. Search for "**Gemini API**"
3. Enter your API key
4. Click **Save**

### 3. Use the Node

Search for "**Gemini Image Generator**" in the node palette and add it to your workflow.

## 🎯 Use Case: WordPress Featured Images

Automatically generate and set featured images for WordPress posts based on their titles.

### Workflow Structure

```
WordPress (Update Post)
  ↓ [outputs: title, id, ...]
Gemini Image Generator
  ↓ [outputs: binary image]
HTTP Request (Upload to WordPress)
  ↓ [outputs: media ID]
WordPress (Set Featured Image)
```

### Step-by-Step Setup

#### 1. WordPress Node - Update Post

- **Resource**: Post
- **Operation**: Update
- **Post ID**: Your post ID
- Update your post content as needed

**Output includes:** `title`, `id`, `status`, etc.

#### 2. Gemini Image Generator Node

Configure the node:

- **Model**: `gemini-3-pro-image-preview`
- **Prompt Source**: `From Input Field`
- **Input Field Name**: `title`
- **Prompt Template**:
  ```
  Tạo ảnh đại diện cho bài viết về chủ đề: "{{input}}"
  Yêu cầu: KHÔNG chèn chữ, chỉ là ảnh để làm nổi bật ý nghĩa của tiêu đề trên.
  ```
- **Aspect Ratio**: `16:9`
- **Image Size**: `1K`
- **Output Format**: `Binary (for upload)`
- **Binary Property Name**: `data`

#### 3. HTTP Request Node - Upload to WordPress

- **Method**: `POST`
- **URL**: `https://your-site.com/wp-json/wp/v2/media`
- **Authentication**: Basic Auth or WordPress API
- **Send Binary Data**: `Yes`
- **Binary Property**: `data`
- **Headers**:
  ```
  Content-Disposition: attachment; filename="featured-{{ $now.toFormat("yyyyMMddHHmmss") }}.png"
  ```

#### 4. WordPress Node - Set Featured Image

- **Resource**: Post
- **Operation**: Update
- **Post ID**: `{{ $('WordPress').item.json.id }}`
- **Additional Fields** → **Featured Media**: `{{ $json.id }}`

## 📝 Node Parameters

### Model

Choose the Gemini model:
- `gemini-3-pro-image-preview` - Latest image generation model
- `gemini-2.0-flash-exp` - Experimental faster model

### Prompt Source

- **From Input Field**: Use data from previous node (recommended for dynamic content)
- **Custom Prompt**: Enter a static prompt

### Input Field Name

The field name to extract from previous node data. Examples:
- `title` - WordPress post title
- `name` - Product name
- `description` - Any description field

### Prompt Template

Use `{{input}}` as placeholder for the input field value.

**Example (Vietnamese):**
```
Tạo ảnh đại diện cho bài viết về chủ đề: "{{input}}"
Yêu cầu: KHÔNG chèn chữ, chỉ là ảnh để làm nổi bật ý nghĩa của tiêu đề trên.
```

**Example (English):**
```
Create a professional featured image for a blog post about: "{{input}}"
Requirements:
- Modern, minimalist style
- No text overlay
- Vibrant colors
- Suitable for technology/business blog
```

### Aspect Ratio

- `16:9` - Wide (recommended for blog headers)
- `9:16` - Tall (for social media stories)
- `4:3` - Standard
- `3:4` - Portrait
- `1:1` - Square (for social media posts)

### Image Size

- `1K` (1024px) - Fast generation, suitable for most uses
- `2K` (2048px) - Medium quality
- `4K` (4096px) - High quality, slower generation

### Output Format

- **Binary (for upload)** - Ready to upload to WordPress, cloud storage, etc.
- **Base64** - Text representation of the image
- **JSON Response** - Full API response for debugging

## 🌟 Example Workflows

### Blog Post Automation

```
RSS Trigger (New Article)
  → WordPress (Create Draft Post)
  → Gemini Image Generator
  → WordPress (Set Featured Image)
  → WordPress (Publish Post)
```

### Social Media Content

```
Google Sheets (Get Product Info)
  → Gemini Image Generator (Product Image)
  → Twitter (Post with Image)
```

### E-commerce Product Images

```
Shopify (New Product)
  → Gemini Image Generator (Generate lifestyle image)
  → Shopify (Upload Product Image)
```

## 🔍 Troubleshooting

### "Field not found or empty in input data"

**Cause:** The input field name doesn't match the data from the previous node.

**Solution:**
1. Click the Gemini node
2. Click "Execute Previous Node" to see the output
3. Find the exact field name containing your content
4. Update "Input Field Name" parameter

### "No image data found in response"

**Causes:**
- Invalid API key
- Model doesn't support image generation
- Prompt not suitable for image generation

**Solutions:**
1. Verify API key at [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Try different model
3. Simplify your prompt

### Image not uploading to WordPress

**Causes:**
- WordPress REST API disabled
- User lacks `upload_files` permission
- Authentication incorrect

**Solutions:**
1. Enable REST API: WordPress Admin → Settings → Permalinks → Save
2. Check user permissions
3. Use Application Password instead of regular password
4. Test API endpoint with curl first

### Rate Limit Errors

Google Gemini API has rate limits. If you hit limits:
- Add delay between requests
- Reduce concurrent executions
- Upgrade quota in Google Cloud Console

## 📖 Documentation

- 🇬🇧 English: This README
- 🇻🇳 Vietnamese: [HDSD-TIENG-VIET.md](./HDSD-TIENG-VIET.md)
- 📤 Publishing: [PUBLISHING-GUIDE.md](./PUBLISHING-GUIDE.md)
- 📋 Requirements: [PROJECT-REQUIREMENTS.md](./PROJECT-REQUIREMENTS.md)

## 🔗 Resources

- [n8n Community](https://community.n8n.io/)
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Get Gemini API Key](https://makersuite.google.com/app/apikey)
- [WordPress REST API](https://developer.wordpress.org/rest-api/)
- [npm Package](https://npmjs.com/package/n8n-wordpress-nano-banana)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
git clone https://github.com/tamtinhte365/n8n-wordpress-nano-banana.git
cd n8n-wordpress-nano-banana
npm install
npm run dev  # Watch mode
```

### Testing

```bash
npm run build
npm link
# Test in n8n
```

## 📄 License

[MIT](LICENSE)

## 💬 Support

- 🐛 Report bugs: [GitHub Issues](https://github.com/tamtinhte365/n8n-wordpress-nano-banana/issues)
- 💡 Feature requests: [GitHub Issues](https://github.com/tamtinhte365/n8n-wordpress-nano-banana/issues)
- 💬 Community support: [n8n Community Forum](https://community.n8n.io/)
- 📧 Email: your-email@example.com

## 🙏 Acknowledgments

- Built for the [n8n](https://n8n.io/) community
- Powered by [Google Gemini API](https://ai.google.dev/gemini-api)
- Inspired by the need for automated content creation

---

**Note:** This is a community node and is not officially supported by n8n or Google.

## ⭐ Show Your Support

If this node helped you, please consider:
- Giving it a star on [GitHub](https://github.com/tamtinhte365/n8n-wordpress-nano-banana)
- Sharing it with others
- Contributing improvements

---

Made with ❤️ by [tamtinhte365](https://github.com/tamtinhte365)
