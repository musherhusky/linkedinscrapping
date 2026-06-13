# Capability: Post Content Type Detection

## Purpose

Detect the content type(s) of a LinkedIn post from raw Apify item data. A post may carry multiple content signals simultaneously (e.g. an image with a URL), so the detection result is a string array rather than a scalar value.

## Requirements

### Requirement: detectContentType returns an array of content types
The system SHALL replace the existing scalar `detectContentType()` function with a multi-type implementation that returns `string[]`. The returned array may contain one or more of: `"image"`, `"video"`, `"document"`, `"article"`, `"link"`, `"repost"`. If none apply, the array SHALL contain exactly `["text"]`. `"text"` SHALL never appear alongside other types.

#### Scenario: Post with image only
- **WHEN** the Apify item has `postImages` with at least one entry and no other media
- **THEN** `detectContentType` returns `["image"]`

#### Scenario: Post with video only
- **WHEN** the Apify item has `postVideo` set and no images
- **THEN** `detectContentType` returns `["video"]`

#### Scenario: Post with document only
- **WHEN** the Apify item has `document` set and no other media
- **THEN** `detectContentType` returns `["document"]`

#### Scenario: Post with article only
- **WHEN** the Apify item has `article` set and no other media or URL in content
- **THEN** `detectContentType` returns `["article"]`

#### Scenario: Post with URL in content (link)
- **WHEN** the Apify item `content` field contains a string matching `/https?:\/\/\S+/` and no media fields are set
- **THEN** `detectContentType` returns `["link"]`

#### Scenario: Repost detected via header text
- **WHEN** the Apify item `header.text` contains the word "reposted" (case-insensitive) and no media fields are set
- **THEN** `detectContentType` returns `["repost"]`

#### Scenario: Plain text post with no media or URL
- **WHEN** the Apify item has no `article`, `postVideo`, `document`, `postImages`, no URL in `content`, and `header.text` does not contain "reposted"
- **THEN** `detectContentType` returns `["text"]`

#### Scenario: Post with image and a URL in content
- **WHEN** the Apify item has `postImages` with at least one entry AND `content` contains a URL
- **THEN** `detectContentType` returns an array containing both `"image"` and `"link"`

#### Scenario: Repost with video
- **WHEN** the Apify item has `postVideo` set AND `header.text` contains "reposted"
- **THEN** `detectContentType` returns an array containing both `"video"` and `"repost"`

#### Scenario: text is never combined
- **WHEN** any specific type is detected (image, video, document, article, link, or repost)
- **THEN** `"text"` SHALL NOT appear in the returned array

### Requirement: mapPost stores content_type as array
The system SHALL pass the array returned by `detectContentType` to `savePost` as `post.contentType`, which maps to the `content_type` column. No change to `savePost` logic is required beyond accepting an array value.

#### Scenario: Scraped post is saved with array content_type
- **WHEN** `mapPost` processes an Apify item and calls `detectContentType`
- **THEN** the resulting post object has `contentType` as a `string[]`

### Requirement: detectContentType is pure and has no side effects
The function SHALL accept a single object argument and return `string[]` deterministically with no I/O, no logging, and no external calls.

#### Scenario: Identical inputs produce identical outputs
- **WHEN** `detectContentType` is called twice with the same input
- **THEN** both calls return structurally equal arrays
