module Savino
  class CategoryPage < Jekyll::PageWithoutAFile
    def initialize(site, category, posts)
      slug = Jekyll::Utils.slugify(category)
      super(site, site.source, File.join('blogg', 'kategori', slug), 'index.html')

      if category == 'Guide'
        title       = 'Guider'
        description = 'Elvinas guider till vinval – praktiska tips utöver de vanliga matmatchningarna.'
      else
        title       = "Vin till #{category.downcase}"
        description = "Elvinas vinmatchningar i kategorin #{category.downcase} – hitta rätt vin till maten."
      end

      self.data['layout']      = 'category'
      self.data['title']       = title
      self.data['description'] = description
      self.data['category']    = category
      self.data['posts']       = posts
      self.data['permalink']   = "/blogg/kategori/#{slug}/"
    end
  end

  class CategoryPageGenerator < Jekyll::Generator
    safe true

    def generate(site)
      site.categories.each do |category, posts|
        site.pages << CategoryPage.new(site, category, posts.sort_by(&:date).reverse)
      end
    end
  end
end
