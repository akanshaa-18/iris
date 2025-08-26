# Manifest-Based Personalization System for Akamai EdgeWorker

This document explains how to set up and use the manifest-based personalization system in your Akamai EdgeWorker project.

## Overview

The manifest system allows you to define personalization rules in JSON files (manifests) that are processed server-side in your Akamai EdgeWorker. This provides better performance and more reliable personalization compared to client-side implementations.

## How It Works

1. **Manifest Discovery**: The system reads manifest paths from HTML meta tags in your pages
2. **Manifest Loading**: Manifests are fetched from your origin server or CDN
3. **Variant Selection**: The system selects the appropriate variant based on targeting rules
4. **Content Application**: Personalization is applied using HTML rewriting

## Setup Instructions

### 1. Add Meta Tags to Your HTML Pages

Add the following meta tags to the `<head>` section of your HTML pages:

```html
<!-- Personalization manifests -->
<meta name="personalization" content="/manifests/hero-personalization.json,/manifests/cta-personalization.json" />

<!-- ROC personalization manifests -->
<meta name="personalization-roc" content="/manifests/roc-personalization.json" />

<!-- Promotional manifests -->
<meta name="manifestnames" content="promo-campaign-1,promo-campaign-2" />
<meta name="apac_manifestnames" content="apac-promo-1" />
<meta name="emea_manifestnames" content="emea-promo-1" />
<meta name="americas_manifestnames" content="americas-promo-1" />
```

### 2. Create Manifest Files

Create JSON manifest files on your origin server. Example structure:

```json
{
  "experiences": {
    "data": [
      {
        "action": "replace",
        "selector": "main > div.hero h1",
        "all": "Welcome to Adobe",
        "mobile": "Welcome to Adobe Mobile",
        "desktop": "Welcome to Adobe Desktop",
        "loggedin": "Welcome back, User!"
      },
      {
        "action": "fragment",
        "selector": "main > div.content",
        "all": "/fragments/hero-content",
        "mobile": "/fragments/hero-content-mobile"
      }
    ]
  },
  "info": {
    "data": [
      {
        "key": "manifest-type",
        "value": "Personalization"
      },
      {
        "key": "manifest-execution-order",
        "value": "First"
      }
    ]
  }
}
```

### 3. Available Actions

- **replace**: Replace element content
- **remove**: Remove element (set value to "true")
- **fragment**: Replace with external HTML fragment
- **updateattribute**: Update element attributes

### 4. Targeting Variants

Define different content for different audiences:

- **all**: Default content for all users
- **mobile**: Mobile device users
- **desktop**: Desktop users
- **loggedin**: Authenticated users
- **chrome**: Chrome browser users
- **firefox**: Firefox browser users
- **android**: Android device users
- **ios**: iOS device users

### 5. Advanced Targeting

You can use complex targeting rules:

```json
{
  "action": "replace",
  "selector": "main > div.hero",
  "mobile&loggedin": "Mobile logged-in content",
  "desktop&not loggedin": "Desktop non-logged-in content",
  "param-edge_pers=on": "Edge personalization enabled content"
}
```

## File Structure

```
src/
├── Personalize/
│   ├── ManifestUtils.ts      # Manifest discovery and metadata extraction
│   ├── ManifestParser.ts     # Manifest parsing and variant selection
│   ├── ManifestLoader.ts     # Manifest loading and consolidation
│   ├── Personalize.ts        # Main personalization logic
│   └── Rewriter.ts           # HTML rewriting (existing)
├── main.ts                   # Main EdgeWorker entry point
└── Utilities/
    └── Utilities.ts          # Utility functions (existing)
```

## Configuration

### Environment Detection

The system automatically detects the environment:
- **Stage**: `stage`, `dev`, `test`, `localhost`, `.page`, `.live`
- **Production**: All other domains

### Locale Detection

The system detects locale from:
1. URL path (e.g., `/en-us/`, `/fr-fr/`)
2. Accept-Language header
3. Defaults to `en-US`

## Usage Examples

### Basic Personalization

1. Create a manifest file: `/manifests/basic-personalization.json`
2. Add meta tag: `<meta name="personalization" content="/manifests/basic-personalization.json" />`
3. Define your personalization rules in the manifest

### Promotional Campaigns

1. Create promotional manifests
2. Add meta tags for different regions:
   ```html
   <meta name="manifestnames" content="global-promo" />
   <meta name="apac_manifestnames" content="apac-promo" />
   <meta name="emea_manifestnames" content="emea-promo" />
   ```

### Manual Override

You can manually override manifests using query parameters:
```
https://your-site.com/page?mep=/manifests/test-manifest.json
```

## Testing

### Enable Personalization

Add query parameters to enable personalization:
```
https://your-site.com/page?edge-pers=on
https://your-site.com/page?target=on
https://your-site.com/page?hybrid-pers=on
```

### Debug Logging

The system provides detailed logging. Check your Akamai EdgeWorker logs for:
- Manifest discovery
- Manifest loading
- Variant selection
- Personalization application

## Performance Considerations

1. **Caching**: Manifests are cached for 5 minutes
2. **Parallel Loading**: Multiple manifests are loaded in parallel
3. **Fallback**: System gracefully handles failed manifest loads
4. **Content-Length**: Headers are properly updated for modified content

## Troubleshooting

### Common Issues

1. **No personalization applied**: Check if personalization is enabled via query parameters
2. **Manifests not loading**: Verify manifest URLs are accessible
3. **Wrong variant selected**: Check targeting rules and user context
4. **Content not updating**: Verify CSS selectors match your HTML structure

### Debug Steps

1. Check EdgeWorker logs for manifest loading messages
2. Verify meta tags are present in HTML
3. Test manifest URLs directly
4. Check targeting rules match user context

## Integration with Adobe Target

For Adobe Target integration:

1. Implement the `loadTargetManifests` function in `ManifestLoader.ts`
2. Add Target API authentication in `Auth/Auth.ts`
3. Configure Target API endpoints and credentials

## Next Steps

1. Create your first manifest file
2. Add meta tags to your HTML pages
3. Test with query parameters
4. Monitor logs for any issues
5. Scale with multiple manifests and complex targeting rules

## Support

For issues or questions:
1. Check the logs for error messages
2. Verify manifest structure matches the expected format
3. Test with simple manifests first
4. Review the example manifest file provided
