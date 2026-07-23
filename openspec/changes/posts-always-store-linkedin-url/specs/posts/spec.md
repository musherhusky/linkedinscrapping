## ADDED Requirements

### Requirement: posts.url always stores the LinkedIn permalink
The `posts` table `url` column SHALL always store the LinkedIn permalink of the post (the same value the system would use for `linkedin_url`), regardless of whether the post shares an external article. `url` SHALL NOT store a third-party article link.

#### Scenario: Post without a shared article
- **WHEN** an Apify item has no `article` and `linkedinUrl = "https://www.linkedin.com/feed/update/urn:li:activity:1"`
- **THEN** `mapPost()` returns `url = "https://www.linkedin.com/feed/update/urn:li:activity:1"`

#### Scenario: Post sharing an external article
- **WHEN** an Apify item has `article.link = "https://example.com/blog-post"` and `linkedinUrl = "https://www.linkedin.com/feed/update/urn:li:activity:2"`
- **THEN** `mapPost()` returns `url = "https://www.linkedin.com/feed/update/urn:li:activity:2"` (the LinkedIn permalink, not the article link)

### Requirement: posts.article_url stores the shared article's external link
The `posts` table SHALL have an `article_url TEXT` column that stores the external link of a shared article when present, and `NULL` when the post has no article.

#### Scenario: Post sharing an external article
- **WHEN** an Apify item has `article.link = "https://example.com/blog-post"`
- **THEN** `mapPost()` returns `articleUrl = "https://example.com/blog-post"` and `savePost()` persists it in `posts.article_url`

#### Scenario: Post without a shared article
- **WHEN** an Apify item has no `article`
- **THEN** `mapPost()` returns `articleUrl = null` and `savePost()` persists `posts.article_url` as `NULL`
