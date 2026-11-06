# MockServer

简体中文 · [English](README.en.md)

[![上游构建状态](https://badge.buildkite.com/3b6803f4fe98cb5ed7bf18292a1434f800b53d8fecb92811d8.svg?branch=master&style=square&theme=slack)](https://buildkite.com/mockserver/mockserver)
[![Apache-2.0 许可证](https://img.shields.io/github/license/mock-server/mockserver-monorepo.svg)](LICENSE.md)
[![上游 GitHub Stars](https://img.shields.io/github/stars/mock-server/mockserver-monorepo.svg)](https://github.com/mock-server/mockserver-monorepo/stargazers)
[![Artifact Hub](https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/mockserver)](https://artifacthub.io/packages/search?repo=mockserver)
[![MCP Toplist](https://mcptoplist.com/badge/com.mock-server%2Fmockserver.svg)](https://mcptoplist.com/server/com.mock-server%2Fmockserver)

MockServer 用于模拟应用依赖的服务、录制请求与响应，也可注入延迟、错误或连接中断，测试应用在依赖故障时的表现。它支持 HTTP(S)、gRPC、WebSocket 等多种协议。

这个 fork 提供简体中文管理页。可以在浏览器中创建 Mock 规则、查看请求记录和验证请求与响应。

## 运行简体中文管理页

准备 JDK 17 或更高版本。在 Bash 中执行以下命令。Windows 可以在 WSL 中执行。构建过程会自动安装前端所需的 Node.js 和 npm。

```bash
git clone https://github.com/Azure-sco/mockserver-monorepo.git
cd mockserver-monorepo/mockserver

VITE_MOCKSERVER_DASHBOARD_LOCALE=zh-CN ./mvnw -B -ntp -pl mockserver-netty -am package -DskipTests -DskipITs
java -jar mockserver-netty/target/mockserver-netty-9.2.1-SNAPSHOT-jar-with-dependencies.jar -serverPort 1080
```

JAR 文件名以 `mockserver-netty/target` 中以 `-jar-with-dependencies.jar` 结尾的文件为准。若本机已有实例占用 1080 端口，可将 `-serverPort` 和下方链接中的端口一起替换。

1. 打开 [快速入门](http://localhost:1080/mockserver/dashboard/#/get-started)，点击 **创建 Mock 规则**。
2. 将请求方法设为 `GET`，路径设为 `/hello`，响应状态码填 `200`，响应体填 `Hello World`，然后点击 **注册规则**。
3. 访问 [示例接口](http://localhost:1080/hello)。在管理页的 **观测 → 请求记录** 中查看收到的请求和对应的响应。

如需单独启动前端开发服务，可参考[简体中文管理页构建说明](mockserver-ui/README.md#简体中文管理页面)。

<a name="getting-started-in-60-seconds"></a>

## Docker 快速上手

下面使用 MockServer 上游发布的 Docker 镜像演示如何注册规则并调用模拟接口。简体中文界面随本仓库上方构建的 JAR 一起打包。

```bash
# 1. 启动 MockServer
docker run -d --rm -p 1080:1080 mockserver/mockserver

# 2. 容器启动后，通过同一端口上的 REST 管理接口注册规则
curl -X PUT http://localhost:1080/mockserver/expectation \
  -H 'Content-Type: application/json' \
  -d '{
        "httpRequest":  { "method": "GET", "path": "/hello" },
        "httpResponse": { "statusCode": 200, "body": "Hello World" }
      }'

# 3. 调用模拟接口
curl http://localhost:1080/hello
# 返回 Hello World
```

macOS 和 Linux 也可通过 [Homebrew](https://brew.sh/) 安装，然后使用 `mockserver` 命令启动。

```bash
brew install mockserver
mockserver run --port 1080
```

启动后可通过客户端库或[管理页面](http://localhost:1080/mockserver/dashboard/)操作。自托管指南涵盖 Docker、Docker Compose、CLI、无需单独安装 JVM 的二进制包、Helm/Kubernetes、JAR 和 Testcontainers。[自托管指南](https://www.mock-server.com/mock_server/self_hosting_mockserver.html)

<a name="one-command-recipes"></a>

### Docker Compose 示例

在 [Docker Compose 示例](examples/docker-compose)的对应目录中运行 `docker compose up`，即可体验从 OpenAPI 定义生成 Mock、代理录制与回放、契约校验代理或故障注入代理。

```bash
cd examples/docker-compose/mock-from-openapi
docker compose up
```

服务启动后，在另一个终端调用示例接口。

```bash
curl http://localhost:1080/pets
```

<a name="drive-it-from-postman-or-bruno"></a>

### 使用 Postman 或 Bruno

[![在 Postman 中运行](https://run.pstmn.io/button.svg)](https://god.gw.postman.com/run-collection/3256712-63a2d67a-46d6-41fd-a544-0535e7393e7d?action=collection%2Ffork&source=rip_markdown&collection-url=entityId%3D3256712-63a2d67a-46d6-41fd-a544-0535e7393e7d%26entityType%3Dcollection%26workspaceId%3D1739eeee-5da1-4112-86a7-b6c094f2b527)

- **Postman** 可点击上方按钮，也可导入[示例集合](examples/postman)。[Postman 指南](https://www.mock-server.com/where/postman.html)
- **Bruno** 是支持 Git 的开源 API 客户端。在 [Bruno](https://www.usebruno.com/) 中选择 **Open Collection**，打开[示例集合](examples/bruno)。[Bruno 指南](https://www.mock-server.com/where/bruno.html)

<a name="why-mockserver"></a>

## 主要功能

- **在同一端口处理多种协议。** 根据连接的起始字节自动识别 HTTP/1.1、HTTPS、HTTP/2、gRPC、gRPC-Web、WebSocket 和原始 TCP。还支持实验性的 HTTP/3（QUIC）、通过 JSON-RPC 模拟 MCP/A2A，以及使用 AsyncAPI 测试 Kafka 和 MQTT 消息代理。
- **模拟响应和代理流量。** 支持预设响应、模板响应和回调响应。用作代理时，可通过端口转发、HTTP 代理、HTTPS 隧道或 SOCKS 转发流量，并记录、检查和修改请求与响应，包括通过 TLS 加密的交互。
- **故障注入。** 按需注入延迟、连接中断和错误，验证应用遇到依赖故障时的处理逻辑。
- **模拟 AI 接口。** 支持 OpenAI、Anthropic、Gemini、Bedrock、Azure OpenAI 和 Ollama 的聊天补全 API，包括流式响应。内置 MCP 服务供 AI 编程助手调用。
- **从规范生成 Mock 规则。** 可导入 OpenAPI 或 Swagger。匹配条件包括方法、路径、查询参数、请求头、Cookie 和请求体，支持 JSON、XML、JSONPath、XPath 和正则表达式。
- **支持多种技术栈和部署方式。** 提供 Java、JavaScript/Node、Python、Ruby、Go、.NET、Rust 和 PHP 客户端，以及 JUnit 和 Spring 集成。可用 Docker、Helm/Kubernetes、JAR 或 WAR 部署，提供实时管理页，多实例部署时可选择共享集群状态。

各版本的功能和修复见[变更日志](changelog.md)。

<a name="install"></a>

## 安装方式

| 上游发布渠道 | 安装命令或依赖 |
| --- | --- |
| Docker Hub | `docker run -d --rm -p 1080:1080 mockserver/mockserver` |
| GitHub Container Registry | `docker run -d --rm -p 1080:1080 ghcr.io/mock-server/mockserver` |
| Homebrew（macOS/Linux） | `brew install mockserver` |
| Helm（[Chart 指南](helm/mockserver/README.md)） | `helm upgrade --install --namespace mockserver mockserver oci://ghcr.io/mock-server/charts/mockserver` |
| Maven Central [![MockServer 版本](https://img.shields.io/maven-central/v/org.mock-server/mockserver-netty.svg)](https://central.sonatype.com/search?q=g:org.mock-server) | `org.mock-server:mockserver-netty-no-dependencies`。其他构件包括 WAR、JUnit 4/5、Spring 和 Maven 插件，见 [Maven 构件列表](https://www.mock-server.com/where/maven_central.html)。 |
| npm | [`mockserver-node`](https://www.npmjs.org/package/mockserver-node)，用于启动和停止服务 |

客户端库可在测试代码中创建 Mock 规则、验证请求和调用管理接口。

[![Java](https://img.shields.io/maven-central/v/org.mock-server/mockserver-client-java.svg?label=Java)](https://central.sonatype.com/artifact/org.mock-server/mockserver-client-java)
[![Node](https://img.shields.io/npm/v/mockserver-client.svg?label=Node)](https://www.npmjs.org/package/mockserver-client)
[![Python](https://img.shields.io/pypi/v/mockserver-client.svg?label=Python)](https://pypi.org/project/mockserver-client/)
[![Ruby](https://badge.fury.io/rb/mockserver-client.png)](https://rubygems.org/gems/mockserver-client)
[![Go](https://pkg.go.dev/badge/github.com/mock-server/mockserver-monorepo/mockserver-client-go/v9.svg)](https://pkg.go.dev/github.com/mock-server/mockserver-monorepo/mockserver-client-go/v9)
[![PHP](https://img.shields.io/packagist/v/mock-server/mockserver-client.svg?label=PHP)](https://packagist.org/packages/mock-server/mockserver-client)
[![.NET](https://img.shields.io/nuget/v/MockServerClient.svg?label=.NET)](https://www.nuget.org/packages/MockServerClient)
[![Rust](https://img.shields.io/crates/v/mockserver-client.svg?label=Rust)](https://crates.io/crates/mockserver-client)

SNAPSHOT 仓库、WAR 部署、Testcontainers 模块及其他安装方式见[自托管指南](https://www.mock-server.com/mock_server/self_hosting_mockserver.html)和[发布渠道](https://www.mock-server.com/where/maven_central.html)。

<a name="requirements"></a>

## 环境要求

- **运行 JAR 或 WAR** 需要 Java 17 或更高版本。MockServer 6.0.0 起要求 Java 17，升级说明见 [Java 17 和 Jakarta 迁移指南](docs/operations/migration-java17-jakarta.md)。上游 Docker 镜像内含 JVM。
- **从源码构建** 需要 JDK 17 或更高版本。
- **使用范围** 为开发和测试环境，详见[安全策略](SECURITY.md)。

<a name="documentation"></a>

## 文档

- **使用教程**见 [MockServer 官方文档](https://www.mock-server.com/)。
- **架构、代码、基础设施与运维**见[仓库文档](docs/README.md)。
- **AI/MCP 集成**通过内置的 [MCP](https://modelcontextprotocol.io) 端点 `/mockserver/mcp` 提供。详见 [llms.txt](https://www.mock-server.com/llms.txt) 和 [AI 集成指南](https://www.mock-server.com/mock_server/ai_mcp_setup.html)。

<a name="versions"></a>

## 版本

[![上游最新版本](https://img.shields.io/maven-central/v/org.mock-server/mockserver-netty.svg?label=latest)](https://github.com/mock-server/mockserver-monorepo/releases)

- **版本变更**见[变更日志](changelog.md)和[上游 GitHub Releases](https://github.com/mock-server/mockserver-monorepo/releases)。每个版本对应一个 `mockserver-<version>` [Git 标签](https://github.com/mock-server/mockserver-monorepo/tags)。
- **API 文档**按版本查阅。Java API 位于 `https://mock-server.com/versions/<version>/apidocs/index.html`，REST API 在 [SwaggerHub](https://app.swaggerhub.com/apis/jamesdbloom/mock-server-openapi) 上按 `major.minor.x` 提供规范。
- **Java 11** 最后支持的发布版本是 [5.15.0](https://github.com/mock-server/mockserver-monorepo/tree/mockserver-5.15.0)，发布于 2023 年 1 月。

> **6.0.0 的 Maven 依赖变更**。使用包含依赖的 JAR 时，将 `mockserver-netty:<version>:shaded` 替换为 `mockserver-netty-no-dependencies:<version>`。

<a name="community--contributing"></a>

## 社区与贡献

- **问题、缺陷或功能建议**可提交到[上游 GitHub Issues](https://github.com/mock-server/mockserver-monorepo/issues?state=open)。请附上 MockServer 版本、运行方式（如 Docker 或 Maven 插件）以及已脱敏的 INFO 或更高级别日志。
- **讨论与路线图**见 [GitHub Discussions](https://github.com/mock-server/mockserver-monorepo/discussions) 和 [GitHub Project](https://github.com/orgs/mock-server/projects/1)。
- **安全问题**的报告方式见[安全策略](SECURITY.md)。
- **社区工具** [MockServer Browser Admin](https://github.com/johnnywang1994/mockserver-browser-admin) 是用 React 和 TypeScript 开发的 Mock 规则管理页面。
- **贡献代码**前可阅读[贡献指南](CONTRIBUTING.md)，查看[待处理事项](https://github.com/mock-server/mockserver-monorepo/issues?state=open)并在相关事项下说明你的计划。

<a name="maintainers"></a>

### 维护者

- [James D Bloom](https://blog.jamesdbloom.com)
