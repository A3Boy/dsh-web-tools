<div align="center">

<p align="center">

  

</p>

dsh-web-tools

DeepSeek Harness 的多搜索源 Web Search / Fetch Provider 插件。

同时配置 Tavily、Exa、Firecrawl、Brave、You.com、Jina 和 SearXNG，并维护一条搜索顺序。某个 Provider 限流、超时、认证失败或不可用时，插件可以继续尝试下一家。

Agent 侧仍然使用 DSH 原生的 web_search / web_fetch，不新增模型工具。

<p align="center">

  

  

  

  

</p>

<p align="center">

  

  

  

  

  

  

</p>

English | 简体中文

</div>

<p align="center">

  

</p>

功能

- 7 个内置 Provider：Tavily、Exa、Firecrawl、Brave、You.com、Jina、SearXNG
- 自定义搜索顺序和 deterministic fallback
- Provider 独立启用 / 禁用
- 每个 Provider 支持多 API Key
- Credential 健康状态和连接测试
- 上游支持时显示余额、额度或 Rate Limit
- Tavily、Exa、Firecrawl、Jina 支持正文读取
- SearXNG 自托管
- Test Search：真实执行搜索并展示命中 Provider、耗时、fallback 过程和结果
- API Key 通过 DSH Credentials 保存

插件不提供代理服务器或共享 Key。请求由本地 DSH Host 直接发往对应 Provider。

安装

当前针对 DeepSeek Harness 0.1.0-rc.6 的 web profile 开发和测试。

    dsh plugin --profile web add github:A3Boy/dsh-web-tools

重启 dsh web 后打开：

    Settings → Web Search

检查插件是否进入当前 profile：

    dsh --profile web --dump-config

更新或移除：

    dsh plugin --profile web update dsh-web-tools
    dsh plugin --profile web remove dsh-web-tools

插件通过 DSH Profile Bundle 加载，不需要修改 Harness 源码。

Provider

  Provider    	Search	Fetch	说明                           
  Tavily      	  ✅   	  ✅  	Agent / RAG 搜索与正文提取          
  Exa         	  ✅   	  ✅  	语义 / neural search、highlights
  Firecrawl   	  ✅   	  ✅  	Search + Scrape              
  Brave Search	  ✅   	  —  	独立 Web 搜索索引                  
  You.com     	  ✅   	  —  	Web / News Search            
  Jina        	  ✅   	  ✅  	Search + Reader              
  SearXNG     	  ✅   	  —  	自托管 Meta Search              

<p align="center">

  

</p>

免费额度参考

上游价格和免费计划可能调整，以下只作为当前选型参考：

  Provider 	当前免费入口                        	备注                                 
  Tavily   	1,000 credits / 月             	无需信用卡                              
  Exa      	注册 20 credits；Free Tier 10 / 月	普通个人 Search Key 没有余额查询 API         
  Firecrawl	1,000 credits / 月             	免费计划无需信用卡                          
  Brave    	每月 $5 credits                 	需要订阅 Search plan，并要求 payment method
  You.com  	新账号 $100 API credits          	无需信用卡                              
  Jina     	新 API Key 10M tokens          	额度以 Jina 当前平台规则为准                  
  SearXNG  	无平台额度                         	成本和限制取决于自己的实例与上游                   

Brave 的 Search、Answers、Autosuggest、Spellcheck 是不同 API 产品。本插件调用 Web Search endpoint，因此需要 Search subscription 对应的 API Key。

搜索顺序与 fallback

设置页维护一条有序 Provider 链。第一项是默认 Provider：

    Tavily → Firecrawl → Exa

Provider 卡片可以拖动排序。一个 Provider 也可以保持配置和启用状态，但不加入自动搜索链。

当前行为：

- 401 / 403：当前 Key 标记为不可用，先尝试同 Provider 的下一把健康 Key
- 408 / 429 / 5xx / network / timeout：进入下一 Provider
- 400 bad request、本地配置错误：不继续 fallback
- 调用方主动取消：立即终止整个链

真实 fallback 示例：

<p align="center">

  

</p>

搜索顺序是确定性的。插件不额外调用 LLM 来选择 Provider。

多 API Key

每个 Provider 可以保存多把 API Key：

    Tavily
    ├── Key A
    ├── Key B
    └── Key C

Key 池使用 least-used-first：

1. 从健康 Key 中选择调用次数最少的一把。
2. 次数相同时按配置顺序选择。
3. 401 / 403 才会把当前 Key 标记为 unhealthy，并尝试同 Provider 的下一把 Key。
4. 429 / 5xx / network / timeout 不会把 Key 判定为失效，而是进入下一 Provider。
5. Key 健康状态保持到对应 Credential 配置发生变化。

Web Client 只拿到掩码后的 Credential 信息，不返回完整 API Key。

Quota / Usage

不同 Provider 的额度单位和查询能力并不一致：

  Provider 	数据来源                    	展示                     
  Tavily   	官方 /usage               	✅ authoritative        
  Firecrawl	官方 /v2/team/credit-usage	✅ authoritative        
  You.com  	官方 Account Balance API  	✅ authoritative        
  Brave    	X-RateLimit-* Search 响应头	✅ authoritative，需先成功搜索 
  Exa      	普通 Search Key 无公开余额接口   	Dashboard / unavailable
  Jina     	Reader 可获得的信息           	Best-effort            
  SearXNG  	自托管                     	无平台额度                  

只有同时存在 remaining 和 limit 时，设置页才显示进度条；不会为了视觉统一伪造百分比。

多 Key Provider 会逐把查询可用额度，并在同一单位下合并成池总额。例如两把 Tavily Key 各有 1,000 credits limit，设置页可以显示总计 2,000 credits。

Quota 查询主要用于状态和设置页展示；真正的 Search fallback 仍由实际请求结果决定。

结果缓存 5 分钟，不做后台轮询。

Test Search

设置页可以直接执行一次真实搜索，查看：

- 实际命中的 Provider
- 总耗时和每次 attempt 的耗时
- success / timeout / auth / rate-limit 等过程
- 返回的搜索结果

<p align="center">

  

</p>

搜索结果数量仍由 DSH web_search 工具层控制。

DSH 负责一次完整 web_search 的总超时；插件设置的 timeout 只限制单个 Provider attempt。

网页读取

典型流程：

    web_search
        ↓
    候选 URL
        ↓
    web_fetch
        ↓
    正文

Tavily、Exa、Firecrawl 和 Jina 使用各自的正文提取能力。

web_fetch 按同一 Provider 顺序寻找支持 Fetch 的下一家，但不会绑定到上一次 web_search 实际命中的 Provider。例如：

    Brave Search
        ↓
    URL
        ↓
    Tavily / Exa / Firecrawl / Jina Fetch

这些 Provider 的 Extract / Reader 接口主要返回正文，因此插件不能保证拿到目标 URL 的真实 HTTP status、最终重定向 URL 等严格 HTTP Fetch 元数据。

需要严格 HTTP Fetch 语义时，可以使用 DSH 自带的 HTTP Fetch。

SearXNG

SearXNG 不需要 API Key。

在 Provider 弹窗中填写实例 Base URL 后即可加入搜索链：

    Tavily → Firecrawl → Exa → SearXNG

也可以只使用 SearXNG。

实际搜索质量、可用性和限流取决于自己的实例、网络以及启用的上游搜索引擎。

安全

- API Key 只在 DSH Host 侧解析
- 完整 Credential 不返回给 Web Client
- 前端只显示掩码和状态
- 测试结果与日志不输出完整 API Key
- 请求不经过本项目维护的中转服务器
- 不上传 Search usage telemetry
- 可以只使用自托管 SearXNG

兼容性与已知限制

- 当前针对 DeepSeek Harness 0.1.0-rc.6 开发和测试
- DSH 仍处于 developer preview，未来版本可能需要适配
- Provider 原生 Extract / Reader 不等价于严格 HTTP Fetch
- Exa 普通个人 Search Key 无公开余额 API
- Brave Search API 需要 Search subscription 对应 Key；Brave 当前要求 payment method
- SearXNG 的结果质量和稳定性取决于实例和上游引擎
- Provider 价格和免费额度由上游控制，可能随时调整

架构

    flowchart TD
        Agent["DSH Agent"] -->|"web_search / web_fetch"| Tool["dsh-tool-web"]
        Tool --> Web["ctx.web"]
        Web --> Hub["dsh-web-tools"]
    
        Hub --> Registry["Provider Registry"]
        Hub --> Fallback["Fallback"]
        Hub --> Pools["Credential Pools"]
        Hub --> Quota["Quota / Health"]
    
        Registry --> Tavily["Tavily"]
        Registry --> Exa["Exa"]
        Registry --> Firecrawl["Firecrawl"]
        Registry --> Brave["Brave"]
        Registry --> You["You.com"]
        Registry --> Jina["Jina"]
        Registry --> SearXNG["SearXNG"]

设置页通过本地 Host routes 读写插件配置：

    flowchart LR
        Client["Web Client"] --> Routes["Host routes<br/>/web-tools/api/*"]
        Routes --> Settings["ctx.settings"]
        Routes --> Credentials["ctx.credentials"]
        Routes --> Tests["Provider Test / Test Search"]
        Routes --> Quota["Quota"]

Provider 选择和 fallback 都在插件内部完成，不为每个 Provider 注册一套模型可见工具。

验证

  项目                                      	状态                   
  TypeScript / Build                      	✅                    
  Pool / fallback / provider adapter 单元测试 	✅                    
  Config / credential / quota / loopback route smoke	✅                    
  Abort / timeout / auth / multi-key runtime invariants	✅                    
  Tavily Search + Quota                   	✅ E2E                
  Exa Search + 多 Key                      	✅ E2E                
  Firecrawl Search + Fetch + Quota        	✅ E2E                
  Brave / You.com / Jina / SearXNG        	Adapter ready，继续补 E2E

运行：

    npm install
    npm test

类型检查和构建：

    npx tsc -p tsconfig.json --noEmit
    npx tsc -p tsconfig.client.json --noEmit
    npx tsc -p tsconfig.build.json
    npm run build

仓库提交编译后的 lib/，用于保证 DSH 从 git 安装插件时可以直接加载 bundle。

Provider 开发

Provider Adapter 位于：

    src/host/providers/

新增 Provider 实现 ProviderAdapter 并在 registry 注册。

如果 Provider 还支持正文读取或 quota 查询，可以同时提供 Fetch / Quota 实现。

具体约定见 CONTRIBUTING.md。

Roadmap

- Serper
- Parallel
- Perplexity
- 更多 Provider E2E
- Provider 搜索结果对比
- Usage history
- 继续评估 web_fetch 与 DSH HTTP Fetch 的职责边界

让编码 Agent 安装

<details>

<summary>安装提示词</summary>

    Install dsh-web-tools:
    
    https://github.com/A3Boy/dsh-web-tools
    
    Requirements:
    - Use the standard plugin installation flow for the current DSH profile.
    - Do not read or print API keys.
    - Do not modify DeepSeek Harness core.
    - After installation, run `dsh --profile web --dump-config` to verify the profile.
    - Do not terminate or restart an existing DSH process without asking me first.
    - Report whether the plugin is present in the web profile.

</details>

Contributing

Issues 和 Pull Requests 都欢迎。

新增 Provider 前请先阅读现有 Adapter 与 CONTRIBUTING.md。

License

MIT © A3Boy
