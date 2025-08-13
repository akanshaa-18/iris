# IRIS - Edge Personalization for Akamai

This project ports the Adobe edge personalization functionality from Cloudflare Workers to Akamai EdgeWorkers, providing real-time personalization capabilities for Adobe.com pages.

## Features

- **Real-time Personalization**: Dynamically personalize content based on user behavior and Adobe Target data
- **Authentication Integration**: Support for Adobe IMS authentication
- **Fragment Loading**: Load and inject personalized content fragments
- **HTML Rewriting**: Modify HTML content based on personalization rules
- **Visitor Tracking**: Track new vs returning visitors
- **Locale Detection**: Automatic locale detection based on URL path and Accept-Language header

## Architecture

The project consists of several modules:

- **Main Entry Point** (`src/main.ts`): Handles incoming requests and orchestrates the personalization flow
- **Authentication** (`src/Auth/Auth.ts`): Manages Adobe IMS authentication and user profile data
- **Personalization** (`src/Personalize/Personalize.ts`): Fetches personalization data from Adobe Target
- **HTML Rewriting** (`src/Personalize/Rewriter.ts`): Modifies HTML content based on personalization rules
- **Utilities** (`src/Utilities/Utilities.ts`): Helper functions for headers, cookies, and locale detection

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   - `CLIENT_SECRET`: Adobe IMS client secret for authentication
   - Configure your Akamai EdgeWorkers environment with the necessary variables

3. **Build the Project**:
```bash
   npm run bundle
   ```

4. **Deploy to Akamai**:
   - Upload the generated `dist/main.js` to your Akamai EdgeWorkers environment
   - Configure the EdgeWorker to handle the appropriate traffic

## Usage

### Personalization Triggers

Personalization is triggered by the following URL parameters:
- `?edge-pers` - Enable edge personalization
- `?target=on` - Enable Adobe Target personalization
- `?hybrid-pers=on` - Enable hybrid personalization
- `?hybrid_test=true` - Enable hybrid testing
- `?perf_test=true` - Enable performance testing

### Example Usage

```javascript
// The EdgeWorker will automatically:
// 1. Check if personalization should be applied
// 2. Authenticate the user (if aux_sid cookie is present)
// 3. Fetch personalization data from Adobe Target
// 4. Rewrite HTML content based on personalization rules
// 5. Add personalization meta tags and scripts
```

## Personalization Features

### Content Replacement
- Replace HTML elements with personalized content
- Remove elements based on personalization rules
- Update element attributes

### Fragment Loading
- Load personalized content fragments from external sources
- Inject fragments into specific page locations

### Visitor Tracking
- Track new vs returning visitors using cookies
- Set appropriate cache headers for personalized content

## Configuration

### Adobe Target Integration
The project integrates with Adobe Target using the following configuration:
- **Production Data Stream ID**: `913eac4d-900b-45e8-9ee7-306216765cd2`
- **Stage Data Stream ID**: `e065836d-be57-47ef-b8d1-999e1657e8fd`
- **Target API URL**: `https://edge.adobedc.net/ee/v2/interact`

### Decision Scopes
The following decision scopes are supported:
- `adobe-target-global-mbox`
- `adobe-target-homepage-hero`
- `adobe-target-navigation`
- `adobe-target-footer`

## Development

### Building
```bash
npm run bundle
```

### Linting
```bash
npm run lint
npm run lint:fix
```

### Testing
```bash
npm test
```

## Ported from Cloudflare

This project was ported from the Cloudflare edge personalization project at:
https://github.com/sharmrj/edge-personalization.git

### Key Changes for Akamai
- Adapted Cloudflare Workers APIs to Akamai EdgeWorkers APIs
- Updated HTML rewriting to use Akamai's `HtmlRewritingStream`
- Modified request/response handling for Akamai's architecture
- Updated caching and cookie handling for Akamai's environment

## License

ISC License - see LICENSE file for details.
