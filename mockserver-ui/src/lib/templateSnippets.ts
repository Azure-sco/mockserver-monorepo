import { uiText } from './dashboardLocale';

/**
 * Curated template snippets for the Composer's snippet palette.
 *
 * Each snippet provides engine-specific syntax for Velocity, Mustache, and
 * JavaScript — matching the real template variables and helpers available in
 * MockServer's template engines (see TemplateFunctions.java,
 * HttpRequestTemplateObject.java, and the per-engine test suites).
 *
 * Snippets are grouped by purpose so the palette can display them categorically.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateEngine = 'VELOCITY' | 'MUSTACHE' | 'JAVASCRIPT';

export interface TemplateSnippet {
  /** Unique identifier for the snippet. */
  id: string;
  /** Short human-readable label shown in the palette. */
  label: string;
  /** One-line description of what the snippet does. */
  description: string;
  /** The template text to insert, keyed by engine. */
  syntax: Record<TemplateEngine, string>;
  /** A static example of what the snippet renders to (for preview). */
  exampleOutput: string;
}

export interface SnippetCategory {
  /** Category identifier. */
  id: string;
  /** Display name for the group. */
  label: string;
  /** Snippets in this group, in display order. */
  snippets: TemplateSnippet[];
}

// ---------------------------------------------------------------------------
// Snippet definitions
// ---------------------------------------------------------------------------

const REQUEST_ECHOES: TemplateSnippet[] = [
  {
    id: 'req-method',
    label: uiText('Request method', "请求方法"),
    description: uiText('Echo the HTTP method of the incoming request.', "返回传入请求的 HTTP 方法。"),
    syntax: {
      VELOCITY: '$request.method',
      MUSTACHE: '{{ request.method }}',
      JAVASCRIPT: 'request.method',
    },
    exampleOutput: 'GET',
  },
  {
    id: 'req-path',
    label: uiText('Request path', "请求路径"),
    description: uiText('Echo the path of the incoming request.', "返回传入请求的路径。"),
    syntax: {
      VELOCITY: '$request.path',
      MUSTACHE: '{{ request.path }}',
      JAVASCRIPT: 'request.path',
    },
    exampleOutput: '/api/users/42',
  },
  {
    id: 'req-body',
    label: uiText('Request body', "请求体"),
    description: uiText('Echo the full request body as a string.', "以字符串形式返回完整请求体。"),
    syntax: {
      VELOCITY: '$!request.body',
      MUSTACHE: '{{ request.body }}',
      JAVASCRIPT: 'request.body',
    },
    exampleOutput: '{"name":"Alice"}',
  },
  {
    id: 'req-header',
    label: uiText('Request header', "请求头"),
    description: uiText('Echo a specific request header (first value). Replace "host" with the header name.', "返回指定请求头的第一个值。将 host 替换为实际请求头名称。"),
    syntax: {
      VELOCITY: '$request.headers.host[0]',
      MUSTACHE: '{{ request.headers.host.0 }}',
      JAVASCRIPT: 'request.headers.host[0]',
    },
    exampleOutput: 'api.example.com',
  },
  {
    id: 'req-query',
    label: uiText('Query parameter', "查询参数"),
    description: uiText('Echo a specific query string parameter. Replace "id" with the param name.', "返回指定查询参数的值。将 id 替换为实际参数名称。"),
    syntax: {
      VELOCITY: '$request.queryStringParameters.id[0]',
      MUSTACHE: '{{ request.queryStringParameters.id.0 }}',
      JAVASCRIPT: 'request.queryStringParameters.id[0]',
    },
    exampleOutput: '42',
  },
  {
    id: 'req-path-param',
    label: uiText('Path parameter', "路径参数"),
    description: uiText('Echo a path parameter (e.g. for /users/{userId}). Replace "userId" with the param name.', "返回路径参数，例如 /users/{userId} 中的参数。将 userId 替换为实际参数名称。"),
    syntax: {
      VELOCITY: '$request.pathParameters.userId[0]',
      MUSTACHE: '{{ request.pathParameters.userId.0 }}',
      JAVASCRIPT: 'request.pathParameters.userId[0]',
    },
    exampleOutput: '42',
  },
  {
    id: 'req-cookie',
    label: uiText('Request cookie', "请求 Cookie"),
    description: uiText('Echo a specific cookie value. Replace "session" with the cookie name.', "返回指定 Cookie 的值。将 session 替换为实际 Cookie 名称。"),
    syntax: {
      VELOCITY: '$request.cookies.session',
      MUSTACHE: '{{ request.cookies.session }}',
      JAVASCRIPT: 'request.cookies.session',
    },
    exampleOutput: 'abc123',
  },
];

const DYNAMIC_DATA: TemplateSnippet[] = [
  {
    id: 'uuid',
    label: 'UUID',
    description: uiText('Generate a random UUID (v4).', "生成随机 UUID（v4）。"),
    syntax: {
      VELOCITY: '$uuid',
      MUSTACHE: '{{ uuid }}',
      JAVASCRIPT: 'uuid',
    },
    exampleOutput: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  },
  {
    id: 'now-iso',
    label: uiText('Timestamp (ISO 8601)', "时间戳（ISO 8601）"),
    description: uiText('Current date-time in ISO 8601 format.', "以 ISO 8601 格式返回当前日期和时间。"),
    syntax: {
      VELOCITY: '$now_iso_8601',
      MUSTACHE: '{{ now_iso_8601 }}',
      JAVASCRIPT: 'now_iso_8601',
    },
    exampleOutput: '2026-01-15T10:30:00Z',
  },
  {
    id: 'now-epoch',
    label: uiText('Timestamp (epoch seconds)', "时间戳（Unix 秒）"),
    description: uiText('Current time as Unix epoch seconds.', "以 Unix 时间戳的秒数返回当前时间。"),
    syntax: {
      VELOCITY: '$now_epoch',
      MUSTACHE: '{{ now_epoch }}',
      JAVASCRIPT: 'now_epoch',
    },
    exampleOutput: '1768472400',
  },
  {
    id: 'now-rfc1123',
    label: uiText('Timestamp (RFC 1123)', "时间戳（RFC 1123）"),
    description: uiText('Current date-time in RFC 1123 format (HTTP Date header style).', "以 RFC 1123 格式返回当前日期和时间，适用于 HTTP Date 请求头。"),
    syntax: {
      VELOCITY: '$now_rfc_1123',
      MUSTACHE: '{{ now_rfc_1123 }}',
      JAVASCRIPT: 'now_rfc_1123',
    },
    exampleOutput: 'Wed, 15 Jan 2026 10:30:00 GMT',
  },
  {
    id: 'rand-int',
    label: uiText('Random integer (0-9)', "随机整数（0–9）"),
    description: uiText('A random integer between 0 and 9.', "生成 0 至 9 之间的随机整数。"),
    syntax: {
      VELOCITY: '$rand_int_10',
      MUSTACHE: '{{ rand_int_10 }}',
      JAVASCRIPT: 'rand_int_10',
    },
    exampleOutput: '7',
  },
  {
    id: 'rand-int-100',
    label: uiText('Random integer (0-99)', "随机整数（0–99）"),
    description: uiText('A random integer between 0 and 99.', "生成 0 至 99 之间的随机整数。"),
    syntax: {
      VELOCITY: '$rand_int_100',
      MUSTACHE: '{{ rand_int_100 }}',
      JAVASCRIPT: 'rand_int_100',
    },
    exampleOutput: '42',
  },
  {
    id: 'faker-name',
    label: uiText('Fake name', "测试姓名"),
    description: uiText('A random first name via Datafaker.', "通过 Datafaker 生成随机名字。"),
    syntax: {
      VELOCITY: '$faker.name().firstName()',
      MUSTACHE: '{{ faker.name.firstName }}',
      JAVASCRIPT: "faker.name().firstName()",
    },
    exampleOutput: 'Alice',
  },
  {
    id: 'faker-email',
    label: uiText('Fake email', "测试邮箱"),
    description: uiText('A random email address via Datafaker.', "通过 Datafaker 生成随机电子邮件地址。"),
    syntax: {
      VELOCITY: '$faker.internet().emailAddress()',
      MUSTACHE: '{{ faker.internet.emailAddress }}',
      JAVASCRIPT: "faker.internet().emailAddress()",
    },
    exampleOutput: 'alice.smith@example.com',
  },
];

const STRUCTURE: TemplateSnippet[] = [
  {
    id: 'json-skeleton',
    label: uiText('JSON response skeleton', "JSON 响应模板"),
    description: uiText('A complete JSON response template echoing method, path, and body.', "完整的 JSON 响应模板，返回请求方法、路径和请求体。"),
    syntax: {
      VELOCITY: [
        '{',
        '  "statusCode": 200,',
        '  "headers": { "content-type": ["application/json"] },',
        '  "body": "{\\"method\\": \\"$request.method\\", \\"path\\": \\"$request.path\\"}"',
        '}',
      ].join('\n'),
      MUSTACHE: [
        '{',
        '  "statusCode": 200,',
        '  "headers": { "content-type": ["application/json"] },',
        '  "body": "{\\"method\\": \\"{{ request.method }}\\", \\"path\\": \\"{{ request.path }}\\"}"',
        '}',
      ].join('\n'),
      JAVASCRIPT: [
        'return {',
        '  statusCode: 200,',
        '  headers: { "content-type": ["application/json"] },',
        '  body: JSON.stringify({ method: request.method, path: request.path })',
        '};',
      ].join('\n'),
    },
    exampleOutput: '{ "statusCode": 200, "body": "{\\"method\\": \\"GET\\", \\"path\\": \\"/api\\"}" }',
  },
  {
    id: 'conditional',
    label: uiText('Conditional (if / else)', "条件分支（if / else）"),
    description: uiText('Return different responses based on the request method.', "根据请求方法返回不同响应。"),
    syntax: {
      VELOCITY: [
        "#if ( $request.method == 'POST' )",
        '{',
        '  "statusCode": 201,',
        '  "body": "created"',
        '}',
        '#else',
        '{',
        '  "statusCode": 200,',
        '  "body": "ok"',
        '}',
        '#end',
      ].join('\n'),
      MUSTACHE: [
        '{{#request.body}}',
        '{',
        '  "statusCode": 200,',
        '  "body": "has body: {{ request.body }}"',
        '}',
        '{{/request.body}}',
        '{{^request.body}}',
        '{',
        '  "statusCode": 200,',
        '  "body": "no body"',
        '}',
        '{{/request.body}}',
      ].join('\n'),
      JAVASCRIPT: [
        "if (request.method === 'POST') {",
        '  return { statusCode: 201, body: "created" };',
        '} else {',
        '  return { statusCode: 200, body: "ok" };',
        '}',
      ].join('\n'),
    },
    exampleOutput: '{ "statusCode": 201, "body": "created" }',
  },
  {
    id: 'loop-headers',
    label: uiText('Iterate over headers', "遍历请求头"),
    description: uiText('Loop through all request headers and include them in the response.', "遍历全部请求头并将其包含在响应中。"),
    syntax: {
      VELOCITY: [
        '{',
        '  "statusCode": 200,',
        "  \"body\": \"{'headers': [#foreach( $value in $request.headers.values() )'$value[0]'#if( $foreach.hasNext ), #end#end]}\"",
        '}',
      ].join('\n'),
      MUSTACHE: [
        '{',
        '  "statusCode": 200,',
        "  \"body\": \"{'headers': [{{#request.headers.entrySet}}{{^-first}}, {{/-first}}'{{ key }}={{ value.0 }}'{{/request.headers.entrySet}}]}\"",
        '}',
      ].join('\n'),
      JAVASCRIPT: [
        'var headers = [];',
        'for (var header in request.headers) {',
        "  headers.push(header + '=' + request.headers[header][0]);",
        '}',
        'return {',
        '  statusCode: 200,',
        "  body: JSON.stringify({ headers: headers })",
        '};',
      ].join('\n'),
    },
    exampleOutput: "{ \"headers\": [\"Host=example.com\", \"Accept=application/json\"] }",
  },
];

// ---------------------------------------------------------------------------
// Grouped categories — exported as the palette data source
// ---------------------------------------------------------------------------

export const SNIPPET_CATEGORIES: SnippetCategory[] = [
  {
    id: 'request-echoes',
    label: uiText('Request Echoes', "请求回显"),
    snippets: REQUEST_ECHOES,
  },
  {
    id: 'dynamic-data',
    label: uiText('Dynamic Data', "动态数据"),
    snippets: DYNAMIC_DATA,
  },
  {
    id: 'structure',
    label: uiText('Structure', "模板结构"),
    snippets: STRUCTURE,
  },
];

/**
 * Flat list of all snippets — useful for lookup by id.
 */
export const ALL_SNIPPETS: TemplateSnippet[] = SNIPPET_CATEGORIES.flatMap((c) => c.snippets);
