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

module Jekyll
  # The generated wine text is "description. Passer godt til …": the last
  # sentence is the pairing part, which the post already covers. Same rule as
  # the app's recommendation card (_dropLastSentence): cut at the last ". ",
  # keep a single-sentence text as it is.
  module WineDescriptionFilter
    def wine_description(text)
      return '' if text.nil?
      trimmed = text.to_s.rstrip
      last_dot = trimmed.rindex('. ')
      return trimmed if last_dot.nil? || last_dot <= 0
      trimmed[0..last_dot]
    end
  end
end

Liquid::Template.register_filter(Jekyll::WineDescriptionFilter)


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
  DIVERSITY_MAX_SCORE_GAP = 0.08
  # Within one post, a second/third wine of the same grape is penalised too
  # (three Chardonnay for a paella is not a selection).
  GRAPE_REPEAT_PENALTY    = 0.04
  # ...and a little for the same wine colour, so a cheese board or mixed menu
  # gets a red, a fortified/white and not three of the same kind.
  COLOR_REPEAT_PENALTY    = 0.03
  @usage = Hash.new(0)

  def self.usage
    @usage
  end

  def self.pick_diverse(recommendations, count = RESULTS_PER_POST, home_country = nil)
    return recommendations if recommendations.nil? || recommendations.length <= count

    best = recommendations.map { |r| r['score'].to_f }.max
    pool = recommendations.select { |r| r['score'].to_f >= best - DIVERSITY_MAX_SCORE_GAP }
    picked = []
    while picked.length < count && !pool.empty?
      choice = pool.max_by do |r|
        r['score'].to_f -
          DIVERSITY_PENALTY * repeat_use(r, home_country) -
          GRAPE_REPEAT_PENALTY * picked.count { |p| same_grape?(p, r) } -
          COLOR_REPEAT_PENALTY * picked.count { |p| p['wineType'] == r['wineType'] }
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

  # Variety is not worth more than a dish's own country: for a dish with a
  # clear home country (pesto → Italy) wines from that country are never
  # pushed down for having appeared in an earlier post.
  def self.repeat_use(rec, home_country)
    return 0 if home_country && rec.dig('wine', 'country').to_s == home_country.to_s

    @usage[wine_key(rec)]
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

  # Reports the three wines a post actually shows so the backend's nightly
  # dishDrinkFeedback review judges exactly what visitors see. Best effort:
  # a failure never affects the build. The server de-duplicates per dish shape.
  def self.report_picks(dish, picks, api_key)
    uri  = URI(ENDPOINT)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl      = true
    http.read_timeout = READ_TIMEOUT_SECONDS
    req = Net::HTTP::Post.new(uri.path)
    req['Content-Type'] = 'application/json'
    req['X-Api-Key']    = api_key
    req.body = JSON.generate(
      action:   'report',
      dishText: dish.encode('UTF-8'),
      marketId: 'se',
      picks:    picks.map do |r|
        {
          name:     r.dig('wine', 'name'),
          wineType: r['wineType'],
          score:    r['score'],
          region:   r.dig('wine', 'region'),
          country:  r.dig('wine', 'country'),
          grape:    r.dig('wine', 'grape')
        }
      end
    )
    req.body.force_encoding('UTF-8')
    res = http.request(req)
    Jekyll.logger.warn 'WineFetcher:', "report HTTP #{res.code} for '#{dish}'" unless res.is_a?(Net::HTTPSuccess)
  rescue StandardError => e
    Jekyll.logger.warn 'WineFetcher:', "report failed for '#{dish}': #{e.message}"
  end

  # Intro text written for exactly the wines the post shows. The search
  # response's own intro describes the pipeline's top three, which the variety
  # pick above often replaces, so it named wines the post never showed.
  # Returns nil on failure: no intro is better than one about other wines.
  def self.fetch_intro(dish, picks, api_key)
    codes = picks.map { |r| r.dig('wine', 'code') }.compact
    return nil if codes.empty?

    cache_file = File.join(CACHE_DIR, "intro-#{Digest::MD5.hexdigest("se|#{dish}|#{codes.join(',')}")}.json")
    return JSON.parse(File.read(cache_file))['introText'] if File.exist?(cache_file)

    uri  = URI(ENDPOINT)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl      = true
    http.read_timeout = READ_TIMEOUT_SECONDS
    req = Net::HTTP::Post.new(uri.path)
    req['Content-Type'] = 'application/json'
    req['X-Api-Key']    = api_key
    req.body = JSON.generate(
      action:   'intro',
      dishText: dish.encode('UTF-8'),
      marketId: 'se',
      codes:    codes
    )
    req.body.force_encoding('UTF-8')
    res = http.request(req)
    unless res.is_a?(Net::HTTPSuccess)
      Jekyll.logger.warn 'WineFetcher:', "intro HTTP #{res.code} for '#{dish}'"
      return nil
    end

    intro = JSON.parse(res.body)['introText']
    return nil if intro.nil? || intro.strip.empty?

    FileUtils.mkdir_p(CACHE_DIR)
    File.write(cache_file, JSON.generate('introText' => intro))
    intro
  rescue StandardError => e
    Jekyll.logger.warn 'WineFetcher:', "intro failed for '#{dish}': #{e.message}"
    nil
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
      maxResults: CANDIDATE_COUNT,
      # The intro is requested for the three shown wines (fetch_intro).
      skipIntro:  true
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

  post.data['wine_recommendations'] = Savino.pick_diverse(data['recommendations'], Savino::RESULTS_PER_POST, data.dig('meta', 'homeCountry'))
  post.data['wine_intro']           = Savino.fetch_intro(dish, post.data['wine_recommendations'], api_key)
  Savino.report_picks(dish, post.data['wine_recommendations'], api_key)
  Jekyll.logger.info 'WineFetcher:', "#{post.data['wine_recommendations']&.length || 0} wines ready"
end
