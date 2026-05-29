import { useState } from 'react';
import { apiEndpoints, generatePostmanCollection, type APIEndpoint } from '../lib/api-docs';

export default function ApiDocs() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const categories = ['All', ...Array.from(new Set(apiEndpoints.map(e => e.category)))];

  const filteredEndpoints = selectedCategory === 'All'
    ? apiEndpoints
    : apiEndpoints.filter(e => e.category === selectedCategory);

  const handleDownloadPostman = () => {
    const collection = generatePostmanCollection(window.location.origin);
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auth-service-api.postman_collection.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(id);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'badge badge-info';
      case 'POST': return 'badge badge-success';
      case 'PUT': return 'badge badge-warning';
      case 'DELETE': return 'badge badge-error';
      default: return 'badge badge-neutral';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">API Documentation</h1>
          <p className="text-text-secondary mt-1">Complete API reference for the authentication service</p>
        </div>
        <button
          onClick={handleDownloadPostman}
          className="btn btn-primary flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download Postman Collection
        </button>
      </div>

      {/* Category Filter */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'btn btn-primary'
                  : 'btn btn-ghost bg-base-200 text-text-secondary hover:bg-base-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* API Endpoints */}
      <div className="space-y-4">
        {filteredEndpoints.map((endpoint, index) => {
          const endpointId = `${endpoint.method}-${endpoint.path}`;
          const isExpanded = expandedEndpoint === endpointId;

          return (
            <div key={index} className="card overflow-hidden p-0">
              {/* Endpoint Header */}
              <button
                onClick={() => setExpandedEndpoint(isExpanded ? null : endpointId)}
                className="w-full p-4 flex items-center justify-between hover:bg-hover transition-colors text-left"
              >
                <div className="flex items-center space-x-4 flex-1">
                  <span className={`px-3 py-1 rounded-md text-xs font-bold ${getMethodColor(endpoint.method)}`}>
                    {endpoint.method}
                  </span>
                  <code className="text-sm font-mono text-text-primary">{endpoint.path}</code>
                  <span className="text-text-secondary hidden md:block">{endpoint.title}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs px-2 py-1 bg-base-200 text-text-secondary rounded">
                    {endpoint.category}
                  </span>
                  <svg
                    className={`w-5 h-5 text-text-secondary transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-border p-6 bg-base-50 space-y-6">
                  {/* Description */}
                  <div>
                    <h3 className="font-semibold text-text-primary mb-2">{endpoint.title}</h3>
                    <p className="text-text-secondary text-sm">{endpoint.description}</p>
                  </div>

                  {/* Authentication */}
                  {endpoint.authentication && (
                    <div>
                      <h4 className="text-sm font-semibold text-text-secondary mb-2">Authentication</h4>
                      <span className="inline-flex items-center px-3 py-1 rounded-md text-sm bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                        {endpoint.authentication}
                      </span>
                    </div>
                  )}

                  {/* Headers */}
                  {endpoint.headers && (
                    <div>
                      <h4 className="text-sm font-semibold text-text-secondary mb-2">Headers</h4>
                      <div className="bg-gray-900 rounded-lg p-4 text-sm font-mono text-gray-100 overflow-x-auto">
                        {Object.entries(endpoint.headers).map(([key, value]) => (
                          <div key={key} className="mb-1">
                            <span className="text-blue-400">{key}</span>: <span className="text-green-400">"{value}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Request Body */}
                  {endpoint.requestBody && (
                    <div>
                      <h4 className="text-sm font-semibold text-text-secondary mb-2">Request Body</h4>
                      {endpoint.requestBody.schema && (
                        <div className="mb-3">
                          <p className="text-xs text-text-secondary mb-2">Schema:</p>
                          <div className="bg-base-100 border border-border rounded-lg p-3 text-sm space-y-1">
                            {Object.entries(endpoint.requestBody.schema).map(([key, type]) => (
                              <div key={key} className="font-mono">
                                <span className="text-primary">{key}</span>: <span className="text-text-secondary">{type as string}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="relative">
                        <div className="absolute top-2 right-2">
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(endpoint.requestBody?.example, null, 2), `req-${endpointId}`)}
                            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded"
                          >
                            {copiedPath === `req-${endpointId}` ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <pre className="bg-gray-900 rounded-lg p-4 text-sm text-gray-100 overflow-x-auto">
                          {JSON.stringify(endpoint.requestBody.example, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Responses */}
                  <div>
                    <h4 className="text-sm font-semibold text-text-secondary mb-3">Responses</h4>
                    <div className="space-y-4">
                      {endpoint.responses.map((response, idx) => (
                        <div key={idx} className="border border-border rounded-lg overflow-hidden">
                          <div className={`px-4 py-2 ${response.status >= 200 && response.status < 300 ? 'bg-success/10' : 'bg-danger/10'}`}>
                            <div className="flex items-center justify-between">
                              <span className={`font-semibold ${response.status >= 200 && response.status < 300 ? 'text-success' : 'text-danger'}`}>
                                {response.status} {response.description}
                              </span>
                              <button
                                onClick={() => copyToClipboard(JSON.stringify(response.example, null, 2), `res-${endpointId}-${idx}`)}
                                className="px-2 py-1 bg-base-100 border border-border hover:bg-hover text-text-secondary text-xs rounded transition-colors"
                              >
                                {copiedPath === `res-${endpointId}-${idx}` ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                          </div>
                          <div className="bg-gray-900 p-4">
                            <pre className="text-sm text-gray-100 overflow-x-auto">
                              {JSON.stringify(response.example, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* cURL Example */}
                  <div>
                    <h4 className="text-sm font-semibold text-text-secondary mb-2">cURL Example</h4>
                    <div className="relative">
                      <div className="absolute top-2 right-2">
                        <button
                          onClick={() => {
                            const curlCommand = generateCurlCommand(endpoint);
                            copyToClipboard(curlCommand, `curl-${endpointId}`);
                          }}
                          className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded"
                        >
                          {copiedPath === `curl-${endpointId}` ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <pre className="bg-gray-900 rounded-lg p-4 text-sm text-green-400 overflow-x-auto">
                        {generateCurlCommand(endpoint)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function generateCurlCommand(endpoint: APIEndpoint): string {
  const baseUrl = window.location.origin;
  const path = endpoint.path.replace(':projectId', 'YOUR_PROJECT_ID').replace(':provider', 'google');

  let curl = `curl -X ${endpoint.method} '${baseUrl}${path}'`;

  // Add headers
  if (endpoint.headers) {
    Object.entries(endpoint.headers).forEach(([key, value]) => {
      curl += ` \\\n  -H '${key}: ${value}'`;
    });
  }

  // Add content-type for POST/PUT
  if (endpoint.requestBody && (endpoint.method === 'POST' || endpoint.method === 'PUT')) {
    if (!endpoint.headers || !endpoint.headers['Content-Type']) {
      curl += ` \\\n  -H 'Content-Type: application/json'`;
    }
  }

  // Add request body
  if (endpoint.requestBody && endpoint.requestBody.type !== 'query') {
    curl += ` \\\n  -d '${JSON.stringify(endpoint.requestBody.example)}'`;
  }

  return curl;
}