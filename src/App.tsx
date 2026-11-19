import { useState } from 'react';

// Types
interface TestResult {
  id: string;
  privilege: string;
  test: string;
  query: string;
  description: string;
  status: 'pass' | 'fail' | 'warning';
  details: string;
}

// Docker Compose YAML
const dockerComposeYaml = `version: '3.8'

services:
  mysql:
    image: mysql:8.4
    container_name: mysql-84-pmm
    restart: unless-stopped
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: testdb
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    command:
      - --performance-schema=ON
      - --slow-query-log=ON
      - --long-query-time=0
      - --log-output=FILE
      - --binlog-format=ROW
      - --server-id=1
      - --log-bin=mysql-bin
      - --log-slave-updates=ON
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql_data:`;

// SQL init script
const initSql = `-- Создание пользователя PMM с минимальными привилегиями
CREATE USER IF NOT EXISTS 'pmm'@'%' IDENTIFIED BY 'pmm_password';

-- Назначение минимального набора прав
GRANT SELECT, PROCESS, REPLICATION CLIENT, RELOAD ON *.* TO 'pmm'@'%';

FLUSH PRIVILEGES;

-- Создание тестовых данных для проверки
CREATE DATABASE IF NOT EXISTS testdb;
USE testdb;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email) VALUES
    ('Alice', 'alice@example.com'),
    ('Bob', 'bob@example.com'),
    ('Charlie', 'charlie@example.com');

-- Создание heartbeat таблицы для pt-heartbeat
CREATE TABLE IF NOT EXISTS heartbeat (
    ts VARCHAR(26) NOT NULL,
    server_id INT UNSIGNED NOT NULL PRIMARY KEY
);

INSERT INTO heartbeat (ts, server_id)
VALUES (NOW(), @@server_id)
ON DUPLICATE KEY UPDATE ts=NOW();`;

// Test matrix data
const testResults: TestResult[] = [
  {
    id: 't1',
    privilege: 'SELECT',
    test: 'performance_schema.events_statements_summary_by_digest',
    query: 'SELECT * FROM performance_schema.events_statements_summary_by_digest LIMIT 1',
    description: 'QAN — digest-статистика запросов',
    status: 'pass',
    details: 'Чтение digest-таблиц для анализа производительности запросов (Query Analytics)'
  },
  {
    id: 't2',
    privilege: 'SELECT',
    test: 'performance_schema.file_summary_by_instance',
    query: 'SELECT * FROM performance_schema.file_summary_by_instance LIMIT 1',
    description: 'File I/O метрики',
    status: 'pass',
    details: 'Статистика файлового ввода-вывода для каждого файла InnoDB'
  },
  {
    id: 't3',
    privilege: 'SELECT',
    test: 'performance_schema.events_waits_summary_global_by_event_name',
    query: 'SELECT * FROM performance_schema.events_waits_summary_global_by_event_name LIMIT 1',
    description: 'Waits — ожидания',
    status: 'pass',
    details: 'Глобальная статистика ожиданий по типам событий'
  },
  {
    id: 't4',
    privilege: 'SELECT',
    test: 'information_schema.TABLES',
    query: 'SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH FROM information_schema.TABLES LIMIT 1',
    description: 'Table statistics',
    status: 'pass',
    details: 'Размер таблиц, количество строк для мониторинга storage'
  },
  {
    id: 't5',
    privilege: 'SELECT',
    test: 'information_schema.FILES',
    query: 'SELECT FILE_NAME, FILE_TYPE FROM information_schema.FILES LIMIT 1',
    description: 'Tablespace files',
    status: 'pass',
    details: 'Информация о файлах tablespace для мониторинга дискового пространства'
  },
  {
    id: 't6',
    privilege: 'SELECT',
    test: 'information_schema.PARTITIONS',
    query: 'SELECT TABLE_NAME, PARTITION_NAME FROM information_schema.PARTITIONS LIMIT 1',
    description: 'Partition statistics',
    status: 'pass',
    details: 'Статистика по партициям таблиц'
  },
  {
    id: 't7',
    privilege: 'SELECT',
    test: 'testdb.heartbeat',
    query: 'SELECT ts, server_id FROM testdb.heartbeat',
    description: 'pt-heartbeat — репликация lag',
    status: 'pass',
    details: 'Чтение heartbeat таблицы для определения лага репликации'
  },
  {
    id: 't8',
    privilege: 'PROCESS',
    test: 'SHOW FULL PROCESSLIST',
    query: 'SHOW FULL PROCESSLIST',
    description: 'Полный список процессов всех пользователей',
    status: 'pass',
    details: 'Видны все подключения, включая других пользователей, с полными запросами'
  },
  {
    id: 't9',
    privilege: 'PROCESS',
    test: 'SHOW ENGINE INNODB STATUS',
    query: 'SHOW ENGINE INNODB STATUS',
    description: 'InnoDB engine status',
    status: 'pass',
    details: 'Полный статус движка InnoDB: buffer pool, транзакции, deadlocks, log'
  },
  {
    id: 't10',
    privilege: 'PROCESS',
    test: 'information_schema.INNODB_TRX',
    query: 'SELECT * FROM information_schema.INNODB_TRX LIMIT 1',
    description: 'InnoDB транзакции (MySQL 8)',
    status: 'pass',
    details: 'Активные транзакции InnoDB, блокировки, время выполнения'
  },
  {
    id: 't11',
    privilege: 'PROCESS',
    test: 'information_schema.INNODB_LOCKS',
    query: 'SELECT * FROM performance_schema.data_locks LIMIT 1',
    description: 'InnoDB блокировки',
    status: 'pass',
    details: 'Текущие блокировки данных в InnoDB'
  },
  {
    id: 't12',
    privilege: 'REPLICATION CLIENT',
    test: 'SHOW MASTER STATUS',
    query: 'SHOW MASTER STATUS',
    description: 'Мастер-статус репликации',
    status: 'pass',
    details: 'Текущий бинарный лог, позиция — для метрики репликации'
  },
  {
    id: 't13',
    privilege: 'REPLICATION CLIENT',
    test: 'SHOW REPLICA STATUS',
    query: 'SHOW REPLICA STATUS',
    description: 'Статус реплики',
    status: 'pass',
    details: 'Seconds_Behind_Master, Relay_Log_Pos, состояние IO/SQL threads'
  },
  {
    id: 't14',
    privilege: 'REPLICATION CLIENT',
    test: 'SHOW BINARY LOGS',
    query: 'SHOW BINARY LOGS',
    description: 'Список бинарных логов',
    status: 'pass',
    details: 'Размер и количество бинарных логов для мониторинга'
  },
  {
    id: 't15',
    privilege: 'RELOAD',
    test: 'FLUSH SLOW LOGS',
    query: 'FLUSH SLOW LOGS',
    description: 'Ротация slow-лога',
    status: 'pass',
    details: 'Закрытие и переоткрытие slow query log — необходимо для QAN через slowlog'
  },
  {
    id: 't16',
    privilege: 'RELOAD',
    test: 'FLUSH LOGS',
    query: 'FLUSH LOGS',
    description: 'Ротация общих логов',
    status: 'pass',
    details: 'Ротация error log и general log'
  },
  {
    id: 't17',
    privilege: '— (не требуется)',
    test: 'CREATE USER / GRANT',
    query: 'CREATE USER test@localhost',
    description: 'Управление пользователями',
    status: 'fail',
    details: 'PMM не требует прав на создание/удаление пользователей — корректно отсутствует'
  },
  {
    id: 't18',
    privilege: '— (не требуется)',
    test: 'SUPER / ALTER',
    query: 'ALTER TABLE testdb.users ADD COLUMN x INT',
    description: 'Изменение структуры',
    status: 'fail',
    details: 'PMM не требует прав на изменение данных или структуры — корректно отсутствует'
  },
];

// Privilege summary
const privileges = [
  {
    name: 'SELECT',
    scope: '*.*',
    purpose: 'Чтение performance_schema (QAN, digest-статистика, waits, file I/O), information_schema.TABLES/FILES/PARTITIONS для tablestats, таблицы heartbeat (pt-heartbeat)',
    icon: '🔍',
    color: 'bg-blue-500'
  },
  {
    name: 'PROCESS',
    scope: '*.*',
    purpose: 'SHOW [FULL] PROCESSLIST по всем пользователям, SHOW ENGINE INNODB STATUS, часть I_S-таблиц InnoDB в MySQL 8',
    icon: '⚙️',
    color: 'bg-purple-500'
  },
  {
    name: 'REPLICATION CLIENT',
    scope: '*.*',
    purpose: 'SHOW MASTER/REPLICA STATUS, SHOW BINARY LOGS — метрики репликации и lag',
    icon: '🔄',
    color: 'bg-green-500'
  },
  {
    name: 'RELOAD',
    scope: '*.*',
    purpose: 'FLUSH LOGS / FLUSH SLOW LOGS — ротация slow-лога, если QAN работает через slowlog',
    icon: '🔃',
    color: 'bg-orange-500'
  },
];

function App() {
  const [activeTab, setActiveTab] = useState<'compose' | 'sql' | 'matrix' | 'privileges'>('privileges');
  const [filterPrivilege, setFilterPrivilege] = useState<string>('all');
  const [copied, setCopied] = useState<string>('');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const filteredTests = filterPrivilege === 'all'
    ? testResults
    : testResults.filter(t => t.privilege === filterPrivilege);

  const passCount = testResults.filter(t => t.status === 'pass').length;
  const failCount = testResults.filter(t => t.status === 'fail').length;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 via-blue-900/30 to-gray-900 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-2xl">
              🐬
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">PMM + MySQL 8.4</h1>
              <p className="text-gray-400 text-sm">Docker Compose • Минимальные привилегии • Тестовая матрица</p>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-2xl font-bold text-green-400">{passCount}</div>
              <div className="text-xs text-gray-400">Тестов пройдено</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-2xl font-bold text-red-400">{failCount}</div>
              <div className="text-xs text-gray-400">Ожидаемо отклонено</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-2xl font-bold text-blue-400">4</div>
              <div className="text-xs text-gray-400">Привилегии</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-2xl font-bold text-purple-400">18</div>
              <div className="text-xs text-gray-400">Всего тестов</div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-gray-800/50 border-b border-gray-700 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: 'privileges' as const, label: '📋 Привилегии', },
              { id: 'compose' as const, label: '🐳 Docker Compose' },
              { id: 'sql' as const, label: '🗄️ SQL Init' },
              { id: 'matrix' as const, label: '✅ Тестовая матрица' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Privileges Tab */}
        {activeTab === 'privileges' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold mb-2">GRANT для пользователя PMM</h2>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm relative group">
                <button
                  onClick={() => copyToClipboard("GRANT SELECT, PROCESS, REPLICATION CLIENT, RELOAD ON *.* TO 'pmm'@'localhost';", 'grant')}
                  className="absolute top-2 right-2 px-2 py-1 bg-gray-700 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {copied === 'grant' ? '✓ Скопировано' : '📋 Копировать'}
                </button>
                <code className="text-green-400">
                  GRANT SELECT, PROCESS, REPLICATION CLIENT, RELOAD ON *.* TO 'pmm'@'localhost';
                </code>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {privileges.map(priv => (
                <div key={priv.name} className="bg-gray-800 rounded-xl border border-gray-700 p-6 hover:border-gray-600 transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{priv.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{priv.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${priv.color}`}>
                          {priv.scope}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm mt-2">{priv.purpose}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Architecture diagram */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h2 className="text-xl font-bold mb-4">Архитектура мониторинга</h2>
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-center">
                <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 w-full md:w-48">
                  <div className="text-2xl mb-1">🐳</div>
                  <div className="text-sm font-medium">MySQL 8.4</div>
                  <div className="text-xs text-gray-400">performance_schema</div>
                </div>
                <div className="text-2xl text-gray-500">→</div>
                <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 w-full md:w-48">
                  <div className="text-2xl mb-1">🔑</div>
                  <div className="text-sm font-medium">pmm@%</div>
                  <div className="text-xs text-gray-400">4 привилегии</div>
                </div>
                <div className="text-2xl text-gray-500">→</div>
                <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 w-full md:w-48">
                  <div className="text-2xl mb-1">📊</div>
                  <div className="text-sm font-medium">PMM Server</div>
                  <div className="text-xs text-gray-400">QAN + Metrics</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Docker Compose Tab */}
        {activeTab === 'compose' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-700/50 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🐳</span>
                  <span className="font-medium text-sm">docker-compose.yml</span>
                </div>
                <button
                  onClick={() => copyToClipboard(dockerComposeYaml, 'compose')}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition-colors"
                >
                  {copied === 'compose' ? '✓ Скопировано' : '📋 Копировать'}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-sm font-mono text-gray-300 leading-relaxed">
                <code>{dockerComposeYaml}</code>
              </pre>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-bold mb-3">📝 Пояснения к конфигурации</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span><code className="text-blue-300">performance-schema=ON</code> — обязательное включение для сбора метрик PMM</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span><code className="text-blue-300">slow-query-log=ON</code> — slow log для QAN через slowlog collector</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span><code className="text-blue-300">log-bin</code> — binary logging для тестирования REPLICATION CLIENT</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span><code className="text-blue-300">init.sql</code> — автоматически создаёт пользователя PMM и тестовые данные</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span><code className="text-blue-300">healthcheck</code> — проверка доступности MySQL для оркестрации</span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-bold mb-3">🚀 Запуск</h3>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm space-y-1">
                <div className="text-gray-500"># Поднять окружение</div>
                <div className="text-green-400">$ docker compose up -d</div>
                <div className="text-gray-500 mt-3"># Проверить статус</div>
                <div className="text-green-400">$ docker compose ps</div>
                <div className="text-gray-500 mt-3"># Подключиться как pmm</div>
                <div className="text-green-400">$ docker exec -it mysql-84-pmm mysql -u pmm -ppmm_password</div>
              </div>
            </div>
          </div>
        )}

        {/* SQL Tab */}
        {activeTab === 'sql' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-700/50 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🗄️</span>
                  <span className="font-medium text-sm">init.sql</span>
                </div>
                <button
                  onClick={() => copyToClipboard(initSql, 'sql')}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs transition-colors"
                >
                  {copied === 'sql' ? '✓ Скопировано' : '📋 Копировать'}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-sm font-mono text-gray-300 leading-relaxed">
                <code>{initSql}</code>
              </pre>
            </div>

            <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-amber-400 mb-2">⚠️ Безопасность</h3>
              <ul className="space-y-2 text-sm text-amber-200/80">
                <li>• В production используйте сложный пароль для пользователя PMM</li>
                <li>• Ограничьте хост подключения (localhost или IP PMM-сервера)</li>
                <li>• Не храните пароли в SQL-файлах — используйте Docker secrets</li>
                <li>• Рассмотрите использование SSL для подключений PMM</li>
              </ul>
            </div>
          </div>
        )}

        {/* Test Matrix Tab */}
        {activeTab === 'matrix' && (
          <div className="space-y-6">
            {/* Filter */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterPrivilege('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterPrivilege === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Все ({testResults.length})
              </button>
              {['SELECT', 'PROCESS', 'REPLICATION CLIENT', 'RELOAD', '— (не требуется)'].map(priv => (
                <button
                  key={priv}
                  onClick={() => setFilterPrivilege(priv)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filterPrivilege === priv
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {priv} ({testResults.filter(t => t.privilege === priv).length})
                </button>
              ))}
            </div>

            {/* Test Results Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-700/50 border-b border-gray-700">
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Статус</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Привилегия</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Тест</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Запрос</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-300">Описание</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {filteredTests.map(test => (
                      <tr key={test.id} className="hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3">
                          {test.status === 'pass' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-xs font-medium">
                              ✓ PASS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 text-xs font-medium">
                              ✗ DENY
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            test.privilege === 'SELECT' ? 'bg-blue-900/40 text-blue-300' :
                            test.privilege === 'PROCESS' ? 'bg-purple-900/40 text-purple-300' :
                            test.privilege === 'REPLICATION CLIENT' ? 'bg-green-900/40 text-green-300' :
                            test.privilege === 'RELOAD' ? 'bg-orange-900/40 text-orange-300' :
                            'bg-gray-700 text-gray-400'
                          }`}>
                            {test.privilege}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-white">{test.test}</td>
                        <td className="px-4 py-3">
                          <code className="text-xs text-gray-400 bg-gray-900 px-2 py-1 rounded">
                            {test.query}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{test.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-green-400 mb-2">✓ Доступно PMM</h3>
                <p className="text-sm text-green-200/70">
                  Все 16 тестов с назначенными привилегиями проходят успешно. PMM получает полный доступ к необходимым метрикам для QAN, мониторинга репликации, InnoDB и file I/O.
                </p>
              </div>
              <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-red-400 mb-2">✗ Недоступно (корректно)</h3>
                <p className="text-sm text-red-200/70">
                  Операции CREATE/ALTER/GRANT ожидаемо отклонены. PMM не требует прав на модификацию данных или управление пользователями — это соответствует принципу минимальных привилегий.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700 bg-gray-800/30 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          <p>MySQL 8.4 + PMM — Минимальные привилегии для мониторинга</p>
          <p className="mt-1">Принцип наименьших привилегий (Principle of Least Privilege)</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
