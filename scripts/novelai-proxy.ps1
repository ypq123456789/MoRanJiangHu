$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$url = $env:NOVELAI_PROXY_URL
$method = $env:NOVELAI_PROXY_METHOD
$headersJson = $env:NOVELAI_PROXY_HEADERS
$bodyBase64 = $env:NOVELAI_PROXY_BODY

try {
    if ([string]::IsNullOrWhiteSpace($url)) {
        throw 'Missing NOVELAI_PROXY_URL'
    }

    Add-Type -AssemblyName System.Net.Http
    [System.Net.ServicePointManager]::SecurityProtocol = (
        [System.Net.SecurityProtocolType]::Tls12 -bor
        [System.Net.SecurityProtocolType]::Tls13
    )

    $headersObject = $null
    if (-not [string]::IsNullOrWhiteSpace($headersJson)) {
        $headersObject = ConvertFrom-Json -InputObject $headersJson
    }

    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
    $client = [System.Net.Http.HttpClient]::new($handler)
    $httpMethod = [System.Net.Http.HttpMethod]::new(($method ?? 'POST'))
    $request = [System.Net.Http.HttpRequestMessage]::new($httpMethod, $url)

    $contentType = ''
    if ($headersObject) {
        foreach ($property in $headersObject.PSObject.Properties) {
            $key = [string]$property.Name
            $value = [string]$property.Value
            if ([string]::IsNullOrWhiteSpace($value)) { continue }
            if ($key -ieq 'Content-Type') {
                $contentType = $value
                continue
            }
            if ($key -ieq 'Content-Length' -or $key -ieq 'Host') {
                continue
            }
            [void]$request.Headers.TryAddWithoutValidation($key, $value)
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($bodyBase64)) {
        $bytes = [Convert]::FromBase64String($bodyBase64)
        $content = [System.Net.Http.ByteArrayContent]::new($bytes)
        if (-not [string]::IsNullOrWhiteSpace($contentType)) {
            $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse($contentType)
        }
        $request.Content = $content
    }

    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $responseBytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $responseHeaders = @{}

    foreach ($header in $response.Headers) {
        $responseHeaders[$header.Key] = ($header.Value -join ', ')
    }
    foreach ($header in $response.Content.Headers) {
        $responseHeaders[$header.Key] = ($header.Value -join ', ')
    }

    $payload = @{
        status = [int]$response.StatusCode
        headers = $responseHeaders
        bodyBase64 = [Convert]::ToBase64String($responseBytes)
    } | ConvertTo-Json -Depth 6 -Compress

    [Console]::Out.Write($payload)
} catch {
    [Console]::Error.Write($_.Exception.ToString())
    exit 1
}
