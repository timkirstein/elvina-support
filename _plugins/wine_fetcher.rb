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

  # Variation across the blog: the endpoint is asked for a wider shortlist and
  # the plugin picks the three shown wines, so the same few bottles don't
  # appear in every post. A wine's adjusted score drops by DIVERSITY_PENALTY
  # for every earlier post it already appears in, and nothing more than
  # DIVERSITY_MAX_SCORE_GAP below the best candidate is ever chosen (a worse
  # match is never swapped in just for variety).
  CANDIDATE_COUNT       = 8
  RESULTS_PER_POST      = 3
  DIVERSITY_PENALTY     = 0.03
  DIVERSITY_MAX_SCORE_GAP = 0.06
  # Within one post, a second/third wine of the same grape is penalised too
  # (three Chardonnay for a paella is not a selection).
  GRAPE_REPEAT_PENALTY    = 0.04
  @usage = Hash.new(0)

  def self.usage
    @usage
  end

  def self.pick_diverse(recommendations, count = RESULTS_PER_POST)
    return recommendations if recommendations.nil? || recommendations.length <= count

    best = recommendations.map { |r| r['score'].to_f }.max
    pool = recommendations.select { |r| r['score'].to_f >= best - DIVERSITY_MAX_SCORE_GAP }
    picked = []
    while picked.length < count && !pool.empty?
      choice = pool.max_by do |r|
        r['score'].to_f -
          DIVERSITY_PENALTY * @usage[wine_key(r)] -
          GRAPE_REPEAT_PENALTY * picked.count { |p| same_grape?(p, r) }
      end
      picked << choice
      pool.delete(choice)
    end
    # Too few close candidates: fill with the next best by score.
    if picked.length < count
      (recommendations - picked).first(count - picked.length).each { |r| picked << r }
    end
    picked.each { |r| @usage[wine_key(r)] += 1 }
    picked.sort_by { |r| -r['score'].to_f }
  end

  def self.same_grape?(a, b)
    ga = a.dig('wine', 'grape').to_s.downcase
    gb = b.dig('wine', 'grape').to_s.downcase
    !ga.empty? && ga == gb
  end

  def self.wine_key(rec)
    (rec.dig('wine', 'name') || rec.dig('wine', 'id') || '').to_s
  end

  def self.fetch_wines(dish, api_key)
    cache_key  = Digest::MD5.hexdigest("se|#{dish}|100|400|#{CANDIDATE_COUNT}")
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
      maxResults: CANDIDATE_COUNT
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
  post.data['wine_recommendations'] = Savino.pick_diverse(data['recommendations'])
  Jekyll.logger.info 'WineFetcher:', "#{post.data['wine_recommendations']&.length || 0} wines ready"
end
