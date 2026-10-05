require 'net/http'
require 'uri'
require 'json'
require 'digest'
require 'fileutils'

module Jekyll
  module WinePriceFilter
    def wine_price(price)
      return '' if price.nil?
      format('%.2f', price.to_f).gsub('.', ',') + ' kr' # SEK
    end
  end
end

Liquid::Template.register_filter(Jekyll::WinePriceFilter)

# blogSearchWines svarar med Systembolagets sortiment på svenska när anropet
# skickar marketId "se". ELVINA_API_KEY (samma värde som BLOG_API_KEY i
# Firebase) sätts som GitHub-secret; saknas den hoppas vinförslagen över.
module Savino
  ENDPOINT     = 'https://europe-west1-grapemate-f80e3.cloudfunctions.net/blogSearchWines'
  CACHE_DIR    = '.jekyll-cache/wine_fetcher'
  # The endpoint runs a full LLM pipeline (dish analysis + intro text + up to
  # 3 wine descriptions) on a cold cache — this can occasionally take longer
  # than a first-request-only timeout would allow. 45s gives real headroom;
  # MAX_ATTEMPTS retries once more on top of that so a single slow/transient
  # request never permanently leaves a post without wines until it happens to
  # be rebuilt again.
  READ_TIMEOUT_SECONDS = 45
  MAX_ATTEMPTS         = 2
  RETRY_DELAY_SECONDS  = 3

  def self.fetch_wines(dish, api_key)
    cache_key  = Digest::MD5.hexdigest("se|#{dish}|100|400|3")
    cache_file = File.join(CACHE_DIR, "#{cache_key}.json")

    if File.exist?(cache_file)
      Jekyll.logger.info 'WineFetcher:', "Cache hit for '#{dish}'"
      return JSON.parse(File.read(cache_file))
    end

    FileUtils.mkdir_p(CACHE_DIR)

    data = nil
    MAX_ATTEMPTS.times do |attempt|
      data = request_wines(dish, api_key)
      break if data

      if attempt < MAX_ATTEMPTS - 1
        Jekyll.logger.warn 'WineFetcher:', "Retrying '#{dish}' (attempt #{attempt + 2}/#{MAX_ATTEMPTS})…"
        sleep RETRY_DELAY_SECONDS
      end
    end
    return nil unless data

    File.write(cache_file, JSON.generate(data))
    data
  end

  def self.request_wines(dish, api_key)
    uri  = URI(ENDPOINT)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl      = true
    http.read_timeout = READ_TIMEOUT_SECONDS

    req = Net::HTTP::Post.new(uri.path)
    req['Content-Type'] = 'application/json'
    req['X-Api-Key']    = api_key
    req.body = JSON.generate(
      dishText:   dish.encode('UTF-8'),
      marketId:   'se',
      priceMin:   100,
      priceMax:   400,
      maxResults: 3
    )
    req.body.force_encoding('UTF-8')

    res = http.request(req)

    unless res.is_a?(Net::HTTPSuccess)
      Jekyll.logger.warn 'WineFetcher:', "HTTP #{res.code} for '#{dish}'"
      return nil
    end

    data = JSON.parse(res.body)

    unless data['success']
      Jekyll.logger.warn 'WineFetcher:', "API failure for '#{dish}': #{data.inspect}"
      return nil
    end

    data
  rescue StandardError => e
    Jekyll.logger.warn 'WineFetcher:', "#{e.class}: #{e.message}"
    nil
  end
end

Jekyll::Hooks.register :posts, :pre_render do |post|
  dish = post.data['dish']
  next unless dish

  api_key = ENV['ELVINA_API_KEY']
  unless api_key
    Jekyll.logger.warn 'WineFetcher:', "ELVINA_API_KEY not set — skipping '#{dish}'"
    next
  end

  Jekyll.logger.info 'WineFetcher:', "Fetching wines for '#{dish}'…"
  data = Savino.fetch_wines(dish, api_key)
  next unless data

  post.data['wine_intro']           = data['introText']
  post.data['wine_recommendations'] = data['recommendations']
  Jekyll.logger.info 'WineFetcher:', "#{data['recommendations']&.length || 0} wines ready"
end
