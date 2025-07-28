import logging
from groq import Groq
from typing import Optional, Dict, Any
from app.config import get_settings
import re

logger = logging.getLogger(__name__)
settings = get_settings()


class GroqService:
    """Service for AI content generation using Groq API."""
    
    def __init__(self):
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize the Groq client."""
        try:
            if not settings.groq_api_key:
                logger.warning("Groq API key not configured")
                return
            
            self.client = Groq(api_key=settings.groq_api_key)
            logger.info("Groq client initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Groq client: {e}")
            self.client = None
    
    async def generate_facebook_post(
        self, 
        prompt: str, 
        content_type: str = "post",
        max_length: int = 500
    ) -> Dict[str, Any]:
        """
        Generate Facebook post content using Groq AI.
        
        Args:
            prompt: User's input prompt
            content_type: Type of content (post, comment, reply)
            max_length: Maximum character length for the content
            
        Returns:
            Dict containing generated content and metadata
        """
        if not self.client:
            raise Exception("Groq client not initialized. Please check your API key configuration.")
        
        try:
            # Construct system prompt for Facebook content generation
            system_prompt = self._get_facebook_system_prompt(content_type, max_length)
            
            # Generate content using Groq
            completion = self.client.chat.completions.create(
                model="llama3-70b-8192",  # Fast and efficient model
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=250,
                temperature=0.6,
                top_p=0.9,
                stream=False
            )
            
            generated_content = completion.choices[0].message.content.strip()
            generated_content = strip_outer_quotes(generated_content)
            
            # Validate content length
            if len(generated_content) > max_length:
                generated_content = generated_content[:max_length-3] + "..."
            
            return {
                "content": generated_content,
                "model_used": "llama3-70b-8192",
                "tokens_used": completion.usage.total_tokens if completion.usage else 0,
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Error generating content with Groq: {e}")
            return {
                "content": f"I'd love to share thoughts about {prompt}! What an interesting topic to explore.",
                "model_used": "fallback",
                "tokens_used": 0,
                "success": False,
                "error": str(e) 
            }
    
    def _get_facebook_system_prompt(self, content_type: str, max_length: int) -> str:
        """Get system prompt based on content type."""
        base_prompt = f"""IMPORTANT: If you include a quote, DO NOT use any quotation marks (" or ') around it. Write the quote as plain text. It should not start or end with quotation marks.

BAD: As Nelson Mandela once said, "The greatest glory in living lies not in never falling, but in rising every time we fall."
GOOD: As Nelson Mandela once said, The greatest glory in living lies not in never falling, but in rising every time we fall.

BAD: "Just a Thursday chilling, rest of the week will be a day for me."
GOOD: Just a Thursday chilling, rest of the week will be a day for me.

You are a regular person sharing content on Facebook in a natural, conversational way.

CRITICAL: Generate ONLY the post content. Do not include any headers, titles, footers, or explanatory text.

Guidelines:
- Write like a real person would naturally speak
- Keep under {max_length} characters
- Use casual, conversational tone
- Include 2-3 relevant emojis naturally in the text, but do not keep too much.
- Write as if you're sharing with friends
- Make it feel spontaneous and authentic
- Avoid corporate or robotic language
- Use newline before hashtags 
- Start directly with the content, no introductions
- Start with capital letter
- End with period
"""
        
        if content_type == "post":
            return base_prompt + """
Write natural Facebook post content that:
- Do not use quotation mark(" ") at the beginning or end of the caption
- Feels like a real person wrote it
- Flows naturally without forced structure
- Includes personal touches or relatable experiences
- Asks questions naturally in conversation style
- Sounds like something you'd actually say to friends

REMEMBER: Output ONLY the post text. No "Here's your post:" or similar prefixes.
"""
        elif content_type == "comment":
            return base_prompt + """
Write a natural comment response that:
- Sounds like genuine human conversation
- Shows authentic interest or support
- Responds directly to what was said
- Uses casual language

REMEMBER: Output ONLY the comment text.
"""
        else:
            return base_prompt + "Write natural, human-like social media content. Output ONLY the content text."
    
    async def generate_auto_reply(
        self, 
        original_comment: str, 
        context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate automatic reply to Facebook comments.
        
        Args:
            original_comment: The comment to reply to
            context: Additional context about the post/brand
            
        Returns:
            Dict containing generated reply and metadata
        """
        if not self.client:
            return {
                "content": "Thank you for your comment! We appreciate your engagement.",
                "model_used": "fallback",
                "success": False,
                "error": "Groq client not initialized"
            }
        
        try:
            system_prompt = """You are a friendly customer service representative responding to Facebook comments.

Guidelines:
- Be warm, professional, and helpful
- Keep responses under 200 characters
- Acknowledge the commenter's input
- Provide value when possible
- Be conversational but professional
- Use appropriate emojis sparingly
- Always be positive and helpful

Generate a personalized response to the following comment:"""
            
            completion = self.client.chat.completions.create(
                model="llama3-70b-8192",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Comment: {original_comment}\nContext: {context or 'General social media page'}"}
                ],
                max_tokens=100,
                temperature=0.6,
                stream=False
            )
            
            reply_content = completion.choices[0].message.content.strip()
            
            return {
                "content": reply_content,
                "model_used": "llama-3.1-8b-instant",
                "tokens_used": completion.usage.total_tokens if completion.usage else 0,
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Error generating auto-reply with Groq: {e}")
            return {
                "content": "Thank you for your comment! We appreciate your engagement. 😊",
                "model_used": "fallback",
                "tokens_used": 0,
                "success": False,
                "error": str(e)
            }
    
    async def generate_instagram_post(
        self,
        prompt: str,
        max_length: int = 800
    ) -> Dict[str, Any]:
        """
        Generate a structured Instagram post caption using Groq AI.
        
        Args:
            prompt: User's input prompt
            max_length: Maximum character length for the caption
            
        Returns:
            Dict containing generated content and metadata
        """
        if not self.client:
            raise Exception("Groq client not initialized. Please check your API key configuration.")
        
        try:
            # Construct system prompt for Instagram content generation
            system_prompt = f"""
        You are an expert social media marketing copywriter specializing in creating compelling, high-conversion Instagram posts for businesses.

        Your mission is to generate a detailed and structured Instagram caption based on the key information provided by the user.
        You must follow this exact format and structure, first do not add any header or footer at all:

        1.  **Hook:** Start with an engaging question or a bold statement to grab the reader's attention. Use a relevant emoji at the beginning of this line.
        2.  **Introduction:** Briefly introduce the brand and its main value proposition.
        3.  **Feature List:** Present 3-5 key features or benefits. Each feature must start on a new line with a '✅' emoji to create a checklist.
        4.  **Contact/Location Information:** List the business's location, phone number, email, or website. Each piece of information should start on a new line and be preceded by a relevant emoji (e.g., 📍 for location, 📞 for phone, 📧 for email, 🌐 for website).
        5.  **Call to Action (CTA):** End with a strong, concluding sentence that encourages the user to take the next step.
        6.  **Hashtags:** Generate a block of 10-15 relevant, niche, and popular hashtags at the very end of the caption.
        7.  **Do not add header or footer at all, just the caption along with the information provided by the user**
        8. **Do not generate or infer missing data (e.g., do not fabricate emails or taglines).**
        9. **Strictly avoid phrases like '[info not provided]', '[not specified]', or similar. If something is not provided, skip it silently.**
        10. **Ensure the final caption reads smoothly, feels complete, and is based only on the user’s input. No blank fields or unnatural gaps.**

        ---
        **HERE IS A PERFECT EXAMPLE OF THE DESIRED OUTPUT:**

        🚧 Is your office layout holding your team back?

        Discover the Anthill IQ Advantage, workspaces designed for focus, flow, and real productivity.

        Welcome to Anthill IQ Workspaces:
        ✅ Customizable private offices tailored for concentration
        ✅ Thoughtful layouts inspired by Vaastu & Feng Shui
        ✅ A productive, community-driven environment

        📍 Bangalore’s destination for purposeful work
        📞 +91 818 1000 060 
        📧 connect@anthilliq.com

        Break free from distractions. Empower your team to achieve more at Anthill IQ.

        #AnthillIQ #FocusFirst #CoworkingIndia #PrivateOfficeSpaces #OfficeProductivity #SmartWorkspaces #VaastuCompliantSpaces #FengShuiOffices #WorkspaceWellness #ModernOfficeDesign #ManagedWorkspaces #BusinessGrowthSpaces #WorkspaceAwareness
        ---

        Now, using the user's input below, create a caption that perfectly matches the structure, tone, and format of the example provided.
        """

            # Generate content using Groq
            completion = self.client.chat.completions.create(
                model="llama3-70b-8192",  # Fast and efficient model
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,  # More tokens for Instagram captions with hashtags
                temperature=0.8,  # Slightly higher for more creative content
                top_p=0.9,
                stream=False
            )
            
            generated_content = completion.choices[0].message.content.strip()
            generated_content = strip_outer_quotes(generated_content)
            
            # Validate content length
            if len(generated_content) > max_length:
                generated_content = generated_content[:max_length-3] + "..."
            
            return {
                "content": generated_content,
                "model_used": "llama3-70b-8192",
                "tokens_used": completion.usage.total_tokens if completion.usage else 0,
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Error generating Instagram content with Groq: {e}")
            return {
                "content": f"✨ Excited to share this amazing moment! {prompt} ✨\n\n#instagram #socialmedia #content #amazing #life #photography #beautiful #inspiration #daily #mood",
                "model_used": "fallback",
                "tokens_used": 0,
                "success": False,
                "error": str(e)
            }

    async def generate_facebook_caption_with_custom_strategy(
        self,
        custom_strategy: str,
        context: str = "",
        max_length: int = 2000
    ) -> Dict[str, Any]:
        """
        Generate Facebook caption using a custom strategy template.
        
        Args:
            custom_strategy: The custom strategy template provided by the user
            context: Additional context or topic for the caption
            max_length: Maximum character length for the caption
            
        Returns:
            Dict containing generated content and metadata
        """
        if not self.client:
            raise Exception("Groq client not initialized. Please check your API key configuration.")
        
        try:
            # Construct system prompt using the custom strategy
            system_prompt = f"""You are a professional social media content creator.

Your task is to create engaging Facebook captions based on the user's custom strategy template.

Custom Strategy Template:
{custom_strategy}

Guidelines:
- Keep content under {max_length} characters
- Follow the custom strategy template provided
- Use a conversational, authentic tone
- Include relevant emojis naturally
- Make it engaging and shareable
- Create content that encourages interaction
- Be creative while staying true to the strategy

Generate a caption that follows the custom strategy template."""

            # Create the user prompt with context
            user_prompt = f"Create a Facebook caption for: {context}" if context else "Create a Facebook caption following the custom strategy."

            # Generate content using Groq
            completion = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=500,
                temperature=0.7,
                top_p=0.9,
                stream=False
            )
            
            generated_content = completion.choices[0].message.content.strip()
            generated_content = strip_outer_quotes(generated_content)
            
            # Validate content length
            if len(generated_content) > max_length:
                generated_content = generated_content[:max_length-3] + "..."
            
            return {
                "content": generated_content,
                "model_used": "llama-3.1-8b-instant",
                "tokens_used": completion.usage.total_tokens if completion.usage else 0,
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Error generating Facebook caption with custom strategy: {e}")
            return {
                "content": f"Excited to share this amazing content! {context} ✨",
                "model_used": "fallback",
                "tokens_used": 0,
                "success": False,
                "error": str(e)
            }

    async def generate_caption_with_custom_strategy(
        self,
        custom_strategy: Dict[str, str],
        context: str = "",
        max_length: int = 2000,
        strategy_type: str = "custom"
    ) -> Dict[str, Any]:
        """
        Generate a caption using structured brand information for 'custom' strategy, or a static/semi-dynamic template for other strategies.
        """
        try:
            def is_provided(val):
                return bool(val and val.strip() and val.strip().lower() not in ['not provided', 'n/a', 'none', '-'])

            # Only for 'custom' strategy, use dynamic structured template
            if strategy_type == "custom":
                brand_name = custom_strategy.get('brandName', '').strip()
                hook_idea = custom_strategy.get('hookIdea', '').strip()
                features = custom_strategy.get('features', '').strip()
                location = custom_strategy.get('location', '').strip()
                phone = custom_strategy.get('phone', '').strip()
                website = custom_strategy.get('website', '').strip()
                call_to_action = custom_strategy.get('callToAction', '').strip()

                formatted_features = ''
                if is_provided(features):
                    feature_list = [f.strip() for f in features.split('\n') if is_provided(f)]
                    formatted_features = '\n'.join([f'✅ {f}' for f in feature_list])

                contact_info = []
                if is_provided(location):
                    contact_info.append(f'📍 {location}')
                if is_provided(phone):
                    contact_info.append(f'📞 {phone}')
                if is_provided(website):
                    website_url = website if website.startswith(('http://', 'https://')) else f'https://{website}'
                    contact_info.append(f'🌐 {website_url}')
                contact_block = '\n'.join(contact_info)

                structured_prompt = f"""**Brand Name:**\n{brand_name}\n\n**Hook/Idea:**\n{hook_idea}\n\n**Key Features/Benefits:**\n{formatted_features}\n\n**Contact Information:**\n{contact_block}\n\n**Call to Action:**\n{call_to_action}"""

                system_prompt = """You are an expert social media marketing copywriter specializing in creating compelling, high-conversion Instagram posts for businesses.\n\nYour task is to generate a detailed and structured Instagram caption based on the provided brand information.Follow this exact format and structure:\n\n1. **Hook:** Start with an engaging question or a bold statement to grab the reader's attention. Use a relevant emoji at the beginning of this line.\n2. **Introduction:** Briefly introduce the brand and its main value proposition.\n3. **Feature List:** Present the key features or benefits as a checklist. Each feature starts with a '✅' emoji.\n4. **Contact/Location Information:** Include only the details that are actually provided (📍 for location, 📞 for phone, 🌐 for website). If any piece of info is missing, omit it entirely without adding placeholders or filler.\n5. **Call to Action (CTA):** End with a strong, concluding sentence that encourages the user to take the next step.using only the user-supplied CTA.\n6. **Hashtags:** Generate a block of 10-15 relevant, niche, and popular hashtags at the very end of the caption.\n7.  **Do not add header or footer at all, just the caption along with the information provided by the user**\n8. **Do not generate or infer missing data (e.g., do not fabricate emails or taglines).**\n9. **Strictly avoid phrases like '[info not provided]', '[not specified]', or similar. If something is not provided, skip it silently.**\n10. **Ensure the final caption reads smoothly, feels complete, and is based only on the user’s input. No blank fields or unnatural gaps.**\n\nMake sure the caption is engaging, on-brand, and encourages interaction. Keep it under {max_length} characters.\n"""
                user_prompt = f"Generate an engaging Instagram caption using this brand information. Focus on creating a natural, compelling narrative that highlights the brand's unique value proposition while incorporating all the provided details. The caption should be optimized for engagement and conversions.\n\n{structured_prompt}"
            else:
                # All other strategies use their own static/semi-dynamic templates, no dynamic brand/location/website injection
                strategy_type_lc = strategy_type.lower().strip()
                if strategy_type_lc == "customer spotlight":
                    system_prompt = "You are a social media manager creating a 'Customer Spotlight' post. Highlight real customer testimonials and experiences. Use a warm, authentic tone. Start with a hook, then list 2-3 short, powerful customer quotes (use realistic names), and end with a call to action. Include 2-3 relevant hashtags. Do not add headers, footers, or explanations."
                    user_prompt = "💬 Don't just take our word for it...\n\nHear from our satisfied customers who've achieved incredible results with our solutions!\n\n✅ 'I was blown away by the personalized support and guidance I received. My business has never been more profitable!' - Rachel P.\n✅ 'Their innovative approach helped me streamline my operations and increase efficiency by 30%!' - John D.\n✅ 'The team's expertise and passion for excellence is unmatched. I couldn't be happier with the results!' - Emily G.\n\nReady to experience success like our customers? Let us help you achieve your goals!\n\n#SuccessStories #CustomerTestimonials #BusinessGrowth #InnovativeSolutions #PersonalizedSupport #StreamlinedOperations #EfficiencyExperts #PassionForExcellence"
                elif strategy_type_lc == "daily inspiration" or strategy_type_lc == "daily motivation":
                    system_prompt = "You are a motivational speaker and social media influencer. Generate a daily inspirational post that uplifts and energizes the audience. Use a positive, encouraging tone, and include 1-2 relevant emojis. Keep it concise and authentic. Do not add any headers, footers, or explanations."
                    user_prompt = 'Growth isn’t found in comfort—it’s found in courage. Face yourself, and you’ll unlock your real potential.\n.\n.\n.\nFollow @successsayings__, @positively_vibing_daily, @dailyinspirationquotes00 for more daily motivation that fuels your mindset.\n.\n.\n.\nLike | Comment | Share\n.\n.\n.\n#motivation #success #inspiration #positivevibes #faith #successsayings #nevergiveup #successmindset #foryou #grateful #quote #wealth #quoteoftheday #growth'
                elif strategy_type_lc == "behind the scenes":
                    system_prompt = "You are a social media storyteller. Write a 'Behind the Scenes' post that gives followers a glimpse into the team's daily work, culture, or creative process. Use a friendly, inclusive tone. Start with a hook, describe 2-3 interesting activities or facts, and end with an invitation to follow or engage. Include 2-3 relevant hashtags. Do not add headers, footers, or explanations."
                    user_prompt = "👀 Ever wondered what goes on behind the scenes of a successful business?\n\nMeet our team, the masterminds behind the magic! We're a group of dedicated individuals passionate about delivering exceptional results.\n\nGet a glimpse of our daily routine:\n✅ Morning brainstorming sessions to tackle new challenges\n✅ Collaborative workshops to drive innovation\n✅ Continuous learning and skill-building to stay ahead of the curve\n\nStay tuned for more behind-the-scenes content, and get ready to meet the people who make it all happen!\n\n#BehindTheScenes #BusinessLife #TeamWork #InnovationNation #CollaborationMatters #MeetTheTeam #BusinessGrowth #CompanyCulture"
                elif strategy_type_lc == "product showcase":
                    system_prompt = "You are a creative marketer. Write a product showcase post that highlights the product's unique features and benefits. Use a friendly, persuasive tone, and include 1-2 relevant emojis. List 2-3 product highlights as bullet points. End with a call to action and 2-3 hashtags. Do not add any headers, footers, or explanations."
                    user_prompt = "🎉 Want to take your product game to the next level?\n\nAt [Brand Name], we're passionate about helping you showcase your best products in the most engaging way possible.\n\nDiscover our top picks:\n✅ Stunning product visuals that grab attention\n✅ Compelling product descriptions that drive sales\n✅ Effective product categorization for easy browsing\n\n🌐 Learn more about our product highlighting solutions at [website URL]\n\nElevate your product showcase and boost conversions today!\n\n#ProductShowcase #EcommerceSolutions #ProductMarketing #VisualCommerce #ProductDescription #ProductCategorization #ConversionOptimization #EcommerceGrowth #ProductHighlighting #OnlineShoppingExperience"
                elif strategy_type_lc == "industry tips":
                    system_prompt = "You are an industry expert sharing valuable tips and insights. Write a post that provides 2-3 actionable tips or insights for your audience. Use a helpful, authoritative tone. Start with a hook, list the tips, and end with a call to action. Include 2-3 relevant hashtags. Do not add headers, footers, or explanations."
                    user_prompt = "💡 Want to stay ahead of the curve in your industry?\n\nGet insider knowledge and expert advice from the forefront of innovation.\n\nStay informed with our latest insights:\n✅ Industry trends and forecasts\n✅ Proven strategies for success\n✅ Exclusive interviews with thought leaders\n\n📅 Mark your calendar for July 28, 2025, and get ready to elevate your game!\n\nTake the first step towards industry dominance. Follow us for more valuable tips and insights.\n\n#IndustryInsights #StayAhead #BusinessTips #InnovationNation #SuccessStrategies #ThoughtLeadership #IndustryTrends #ForecastingSuccess #ElevateYourGame"
                elif strategy_type_lc == "lifestyle content":
                    system_prompt = "You are a lifestyle influencer. Write a post that shares relatable, aspirational, or entertaining lifestyle content. Use a friendly, authentic tone, and include 1-2 relevant emojis. End with a call to action and 2-3 hashtags. Do not add headers, footers, or explanations."
                    user_prompt = "🌿 Embrace the little moments that make life beautiful! Whether it's a morning coffee ritual or a sunset stroll, find joy in the everyday.\n\nShare your favorite daily ritual in the comments below!\n\n#Lifestyle #LiveWell #EverydayJoy #MindfulMoments #SimplePleasures #WellnessJourney"
                elif strategy_type_lc == "user generated content":
                    system_prompt = "You are a social media manager. Write a post that highlights and credits user-generated content from your community. Use a grateful, community-focused tone, and include 1-2 relevant emojis. Mention the user (e.g., @username) and encourage others to share. End with 2-3 hashtags. Do not add headers, footers, or explanations."
                    user_prompt = "🙌 Huge thanks to @amazinguser for sharing this incredible photo! We love seeing how you use our products in your daily life.\n\nWant to be featured? Tag us in your posts and use #OurBrandCommunity for a chance to be spotlighted!\n\n#UserGeneratedContent #CommunityLove #FeaturedFan"
                else:
                    system_prompt = "You are a social media content creator. Write a post based on the following context. Do not add any headers, footers, or explanations."
                    user_prompt = context or "Generate a social media post."

            completion = self.client.chat.completions.create(
                model="llama3-70b-8192",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=1000,
                temperature=0.7,
                top_p=0.9,
                stream=False
            )

            generated_caption = completion.choices[0].message.content.strip()
            return {
                "success": True,
                "content": generated_caption,
                "model": "llama3-70b-8192",
                "tokens_used": completion.usage.total_tokens if hasattr(completion, 'usage') else 0
            }

        except Exception as e:
            logger.error(f"Error generating caption with custom strategy: {str(e)}")
            return {
                "content": f"Excited to share this amazing content! {context} ✨",
                "model_used": "fallback",
                "tokens_used": 0,
                "success": False,
                "error": str(e)
            }

    def is_available(self) -> bool:
        """Check if Groq service is available."""
        return self.client is not None


# Global service instance
groq_service = GroqService() 

def strip_outer_quotes(text: str) -> str:
    # Remove leading/trailing single or double quotes, and any leading/trailing whitespace/newlines
    return re.sub(r'^[\'"]+|[\'"]+$', '', text).strip() 